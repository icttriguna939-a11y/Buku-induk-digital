console.log('%c[BAGIAN3C_LAZY] dimuat: Nilai Excel + Ekspor 8355 (v1)', 'color:#0a7');
// ───── Pembantu umum ─────
// CATATAN: jangan menulis entitas HTML (ampersand-lt dst.) langsung di file ini; HtmlService mengubahnya sebelum dikirim ke klien. Pakai \x26.
function nxEsc(s) { return String(s === null || s === undefined ? '' : s).replace(/[\x26<>"']/g, c => ({ '\x26': '\x26amp;', '<': '\x26lt;', '>': '\x26gt;', '"': '\x26quot;', "'": '\x26#39;' }[c])); }

function nxMuatScript(url, sudahAda) {
  return new Promise((ok, gagal) => {
    if (sudahAda()) return ok();
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => sudahAda() ? ok() : gagal(new Error('Pustaka gagal diinisialisasi.'));
    s.onerror = () => gagal(new Error('Tidak bisa memuat pustaka dari internet: ' + url));
    document.head.appendChild(s);
  });
}
const nxMuatXLSX = () => nxMuatScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', () => !!window.XLSX);
const nxMuatExcelJS = () => nxMuatScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', () => !!window.ExcelJS);

/** google.script.run versi Promise */
function nxGas(nama, ...args) {
  return new Promise((ok, gagal) => {
    google.script.run.withSuccessHandler(ok).withFailureHandler(e => gagal(new Error((e && e.message) || e))) [nama](...args);
  });
}

function nxUnduhBlob(blob, namaFile) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function nxNamaAman(s) { return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, ''); }

function nxPredikat(n) { return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : 'D'; } // ← ubah ambang di sini bila aturan sekolah berbeda

function nilaiStatus(html) { const el = document.getElementById('nilaiExcelStatus'); if (el) el.innerHTML = html; }
const nxSpin = t => `<div class="text-muted small"><span class="spinner-border spinner-border-sm me-2"></span>${nxEsc(t)}</div>`;

// ═══════════════════════════════════════════════════════════════
// A. TEMPLATE NILAI (unduh)
// ═══════════════════════════════════════════════════════════════
async function nilaiUnduhTemplate() {
  const kelasId = document.getElementById('nilaiKelasSelect').value;
  const ta = document.getElementById('nilaiTA').value.trim();
  const sem = document.getElementById('nilaiSemester').value;
  if (!kelasId || !ta) { showToast('Peringatan', 'Pilih Kelas dan isi Tahun Ajaran terlebih dahulu.', 'warning'); return; }
  try {
    nilaiStatus(nxSpin('Menyiapkan template…'));
    await nxMuatXLSX();
    const res = await nxGas('nilaiTemplateData', AppState.token, kelasId, ta, sem);
    if (!res.success) throw new Error(res.message);
    const kelas = (AppState.cache.kelas || []).find(k => k.ID === kelasId) || {};
    const mapel = getMapelUntukKelas(kelasId);
    const siswa = res.data.siswa, nilai = res.data.nilai;
    if (!siswa.length) throw new Error('Kelas ini belum memiliki siswa aktif.');

    const peta = {};
    nilai.forEach(n => { peta[n.NIS + '|' + n.MataPelajaran] = n; });
    const kktpMapel = mapel.map(mp => {
      const ada = nilai.find(n => n.MataPelajaran === mp && Number(n.KKTP) > 0);
      return ada ? Number(ada.KKTP) : 75;
    });

    const aoa = [['NIS', 'NAMA SISWA'].concat(mapel), ['', 'KKTP'].concat(kktpMapel)];
    siswa.forEach(s => {
      aoa.push([String(s.NIS), s.NamaLengkap].concat(mapel.map(mp => {
        const n = peta[s.NIS + '|' + mp];
        return n && n.Nilai !== '' && n.Nilai !== null && !isNaN(Number(n.Nilai)) ? Number(n.Nilai) : '';
      })));
    });

    const wsNilai = XLSX.utils.aoa_to_sheet(aoa);
    wsNilai['!cols'] = [{ wch: 12 }, { wch: 34 }].concat(mapel.map(() => ({ wch: 16 })));
    wsNilai['!freeze'] = { xSplit: 2, ySplit: 2 };

    const wsInfo = XLSX.utils.aoa_to_sheet([
      ['PARAMETER', 'NILAI'], ['ID Kelas', kelasId], ['Nama Kelas', kelas.NamaKelas || ''],
      ['Tahun Ajaran', ta], ['Semester', sem], [], ['JANGAN mengubah isi sheet INFO ini.']
    ]);
    wsInfo['!cols'] = [{ wch: 16 }, { wch: 40 }];

    const wsPetunjuk = XLSX.utils.aoa_to_sheet([
      ['TEMPLATE NILAI RAPOR — ' + (kelas.NamaKelas || '') + ' — ' + ta + ' ' + sem],
      [],
      ['1. Isi nilai (angka 0–100) pada sheet NILAI. Satu baris = satu siswa, satu kolom = satu mata pelajaran.'],
      ['2. Baris KKTP (baris ke-2) boleh diubah; nilainya berlaku untuk seluruh siswa pada mata pelajaran itu.'],
      ['3. Sel nilai yang dikosongkan akan DILEWATI (nilai lama di aplikasi tidak dihapus).'],
      ['4. Predikat (A/B/C/D) dihitung otomatis oleh aplikasi dari nilai.'],
      ['5. Jangan mengubah kolom NIS, judul kolom, nama sheet, dan sheet INFO.'],
      ['6. Simpan file, lalu unggah lewat menu Nilai Rapor → tombol “Impor Nilai dari Excel”.']
    ]);
    wsPetunjuk['!cols'] = [{ wch: 110 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'PETUNJUK');
    XLSX.utils.book_append_sheet(wb, wsNilai, 'NILAI');
    XLSX.utils.book_append_sheet(wb, wsInfo, 'INFO');
    const nama = 'Template_Nilai_' + nxNamaAman(kelas.NamaKelas || 'Kelas') + '_' + nxNamaAman(ta) + '_' + sem + '.xlsx';
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    nxUnduhBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nama);
    nilaiStatus(`<div class="alert alert-success py-2 small mb-0">Template <b>${nxEsc(nama)}</b> sudah diunduh (${siswa.length} siswa × ${mapel.length} mata pelajaran).</div>`);
  } catch (e) {
    nilaiStatus(`<div class="alert alert-danger py-2 small mb-0">${nxEsc(e.message)}</div>`);
  }
}

// ═══════════════════════════════════════════════════════════════
// B. IMPOR NILAI DARI EXCEL
// ═══════════════════════════════════════════════════════════════
const nilaiImporState = { records: null, ringkas: '' };

async function nilaiPilihFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  try {
    nilaiStatus(nxSpin('Membaca file…'));
    await nxMuatXLSX();
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    if (!wb.Sheets['INFO'] || !wb.Sheets['NILAI']) throw new Error('File ini bukan template Nilai Rapor (sheet INFO / NILAI tidak ditemukan). Unduh template dari aplikasi lalu isi.');

    const p = {};
    XLSX.utils.sheet_to_json(wb.Sheets['INFO'], { header: 1, defval: '' }).forEach(r => { p[String(r[0]).trim()] = String(r[1]).trim(); });
    const ta = p['Tahun Ajaran'], sem = p['Semester'];
    if (!ta || !sem) throw new Error('Sheet INFO tidak memuat Tahun Ajaran / Semester.');

    const a = XLSX.utils.sheet_to_json(wb.Sheets['NILAI'], { header: 1, defval: '', raw: true });
    const head = a[0] || [], kktpRow = a[1] || [];
    const kolom = [];
    for (let c = 2; c < head.length; c++) { const mp = String(head[c]).trim(); if (mp) kolom.push({ c: c, mp: mp }); }
    if (!kolom.length) throw new Error('Tidak ada kolom mata pelajaran di sheet NILAI.');

    const records = [], peringatan = [], nisSet = {};
    for (let r = 2; r < a.length; r++) {
      const nis = String(a[r][0]).trim();
      if (!nis) continue;
      nisSet[nis] = true;
      kolom.forEach(k => {
        let v = a[r][k.c];
        if (typeof v === 'string') { v = v.trim().replace(',', '.'); if (v === '') return; v = Number(v); }
        if (v === '' || v === null || v === undefined) return;
        if (!isFinite(v) || v < 0 || v > 100) { peringatan.push(`${nis} – ${k.mp}: “${a[r][k.c]}” tidak valid (harus 0–100), dilewati`); return; }
        let kktp = Number(kktpRow[k.c]);
        if (!isFinite(kktp) || kktp <= 0) kktp = 75;
        records.push({ NIS: nis, TahunAjaran: ta, Semester: sem, MataPelajaran: k.mp, KKTP: kktp, Nilai: v, Predikat: nxPredikat(v) });
      });
    }
    if (!records.length) throw new Error('Tidak ada nilai yang terisi di file ini.');

    nilaiImporState.records = records;
    nilaiStatus(`
      <div class="alert alert-info py-2 small mb-2">
        <b>${nxEsc(f.name)}</b><br>
        Tahun Ajaran <b>${nxEsc(ta)}</b> · Semester <b>${nxEsc(sem)}</b><br>
        ${Object.keys(nisSet).length} siswa · <b>${records.length}</b> nilai siap disimpan
        ${peringatan.length ? `<br><span class="text-danger">${peringatan.length} sel dilewati:</span><ul class="mb-0">${peringatan.slice(0, 8).map(x => `<li>${nxEsc(x)}</li>`).join('')}</ul>` : ''}
      </div>
      <button class="btn btn-primary-solid btn-sm" id="btnNilaiKirim" onclick="safeCallLazyC('nilaiKirimImpor')"><i class="bi bi-cloud-upload"></i> Simpan ke Aplikasi</button>`);
  } catch (e) {
    nilaiImporState.records = null;
    nilaiStatus(`<div class="alert alert-danger py-2 small mb-0">${nxEsc(e.message)}</div>`);
  } finally {
    input.value = '';
  }
}

async function nilaiKirimImpor() {
  const semua = nilaiImporState.records;
  if (!semua || !semua.length) return;
  const btn = document.getElementById('btnNilaiKirim');
  if (btn) btn.disabled = true;
  const UKURAN = 150;
  let baru = 0, diperbarui = 0;
  const tdk = {};
  try {
    for (let i = 0; i < semua.length; i += UKURAN) {
      nilaiStatus(nxSpin(`Menyimpan… ${Math.min(i + UKURAN, semua.length)} / ${semua.length}`));
      const res = await nxGas('nilaiImporBatch', AppState.token, semua.slice(i, i + UKURAN));
      if (!res.success) throw new Error(res.message);
      baru += res.data.baru; diperbarui += res.data.diperbarui;
      (res.data.tidakDikenal || []).forEach(n => { tdk[n] = true; });
    }
    nilaiImporState.records = null;
    const tidak = Object.keys(tdk);
    nilaiStatus(`<div class="alert alert-success py-2 small mb-0">Selesai. <b>${baru}</b> nilai baru, <b>${diperbarui}</b> nilai diperbarui.
      ${tidak.length ? `<br><span class="text-danger">NIS tidak ditemukan di data siswa (dilewati): ${nxEsc(tidak.join(', '))}</span>` : ''}
      <br>Tekan “Muat Form” pada siswa untuk melihat hasilnya.</div>`);
    showToast('Berhasil', `${baru + diperbarui} nilai tersimpan.`, 'success');
  } catch (e) {
    nilaiStatus(`<div class="alert alert-danger py-2 small mb-0">Gagal: ${nxEsc(e.message)}<br>Sebagian nilai mungkin sudah tersimpan; mengunggah ulang file yang sama aman (tidak membuat duplikat).</div>`);
    if (btn) btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// C. PEMBERSIH DUPLIKAT NILAI_RAPOR
// ═══════════════════════════════════════════════════════════════
async function nilaiCekDuplikat() {
  try {
    nilaiStatus(nxSpin('Memeriksa sheet Nilai_Rapor…'));
    const res = await nxGas('nilaiCariDuplikat', AppState.token);
    if (!res.success) throw new Error(res.message);
    const d = res.data;
    if (!d.jumlahHapus) { nilaiStatus(`<div class="alert alert-success py-2 small mb-0">Tidak ada duplikat. Sheet Nilai_Rapor bersih (${d.totalBaris} baris).</div>`); return; }
    nilaiStatus(`
      <div class="alert alert-warning py-2 small mb-2">
        Ditemukan <b>${d.jumlahGrup}</b> nilai yang tercatat ganda → <b>${d.jumlahHapus}</b> baris berlebih akan dihapus dari total ${d.totalBaris} baris.<br>
        Yang dipertahankan: baris terbawah (terbaru) yang nilainya terisi. Sebelum menghapus, aplikasi membuat sheet cadangan otomatis.
      </div>
      <div class="table-responsive-wrap" style="max-height:260px;overflow:auto"><table class="table-ledger">
        <thead><tr><th>NIS</th><th>Tahun Ajaran</th><th>Semester</th><th>Mata Pelajaran</th><th>Jumlah baris</th></tr></thead>
        <tbody>${d.contoh.map(x => `<tr><td>${nxEsc(x.NIS)}</td><td>${nxEsc(x.TahunAjaran)}</td><td>${nxEsc(x.Semester)}</td><td>${nxEsc(x.MataPelajaran)}</td><td>${x.jumlah}</td></tr>`).join('')}</tbody></table></div>
      ${d.jumlahGrup > d.contoh.length ? `<div class="text-muted small mt-1">…dan ${d.jumlahGrup - d.contoh.length} lainnya.</div>` : ''}
      <button class="btn btn-danger btn-sm mt-2" id="btnNilaiHapusDup" onclick="safeCallLazyC('nilaiHapusDuplikat')"><i class="bi bi-trash"></i> Hapus ${d.jumlahHapus} Baris Ganda</button>`);
  } catch (e) {
    nilaiStatus(`<div class="alert alert-danger py-2 small mb-0">${nxEsc(e.message)}</div>`);
  }
}

async function nilaiHapusDuplikat() {
  const btn = document.getElementById('btnNilaiHapusDup');
  if (btn) btn.disabled = true;
  try {
    nilaiStatus(nxSpin('Membuat cadangan lalu menghapus duplikat…'));
    const res = await nxGas('nilaiHapusDuplikat', AppState.token);
    if (!res.success) throw new Error(res.message);
    nilaiStatus(`<div class="alert alert-success py-2 small mb-0">${nxEsc(res.message)}${res.data && res.data.cadangan ? `<br>Cadangan tersimpan di sheet <b>${nxEsc(res.data.cadangan)}</b> (boleh dihapus manual bila sudah yakin).` : ''}</div>`);
    showToast('Berhasil', res.message, 'success');
  } catch (e) {
    nilaiStatus(`<div class="alert alert-danger py-2 small mb-0">${nxEsc(e.message)}</div>`);
  }
}

// ═══════════════════════════════════════════════════════════════
// D. EKSPOR MODEL 8355  (menu "Ekspor Model 8355")
// ═══════════════════════════════════════════════════════════════
// Nilai bawaan — dapat diubah langsung di kolom isian pada menu sebelum mengunduh.
const EKSP8355_BAWAAN = {
  sekolah: 'SMA Triguna',
  alamat: 'Jln. Bintaro Permai II No. 9',
  kecamatan: 'Pesanggrahan',
  kota: 'Jakarta Selatan',
  kota_ttd: 'Jakarta',
  pengawas: 'Dr. Parjuangan Lubis, M.M.',
  nipPengawas: '196812081993031007',
  kepala: '',
  nipKepala: ''
};
const eksp8355State = { kelas: [], siswa: [] };

function ekspTingkatUrut(k) {
  const t = (String(k.Tingkat) + ' ' + String(k.NamaKelas)).toUpperCase();
  if (/XII|\b12\b/.test(t)) return 12;
  if (/XI\b|\b11\b/.test(t)) return 11;
  if (/\bX\b|\b10\b/.test(t) || /^X/.test(String(k.NamaKelas).toUpperCase())) return 10;
  return 0;
}

function ekspTanggalIndo(d) {
  const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return d.getDate() + ' ' + b[d.getMonth()] + ' ' + d.getFullYear();
}

function ekspTgl(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return s;
}

async function renderEksp8355() {
  const box = document.getElementById('eksp8355Content');
  box.innerHTML = '<div class="card-surface p-3">' + nxSpin('Memuat data siswa dan kelas…') + '</div>';
  try {
    const [res, pc] = await Promise.all([nxGas('export8355Data', AppState.token), nxGas('getPengaturanCetak').catch(() => ({ data: {} }))]);
    if (!res.success) throw new Error(res.message);
    const cetak = (pc && pc.data) || {};
    eksp8355State.kelas = res.data.kelas;
    eksp8355State.siswa = res.data.siswa;

    const daftarTa = Array.from(new Set(res.data.kelas.map(k => k.TahunAjaran).filter(x => x))).sort().reverse();
    if (!daftarTa.length) throw new Error('Belum ada data kelas.');
    const taAktif = daftarTa.indexOf(cetak.tahunAjaranAktif) >= 0 ? cetak.tahunAjaranAktif : daftarTa[0];
    const B = EKSP8355_BAWAAN;
    const f = (id, label, val, lebar) => `<div class="col-md-${lebar || 6}"><label class="form-label small mb-1">${label}</label><input type="text" class="form-control form-control-sm" id="${id}" value="${nxEsc(val)}"></div>`;

    box.innerHTML = `
      <div class="card-surface p-3 mb-3">
        <h6 class="mb-1">Ekspor Daftar Nama Siswa — Model 8355</h6>
        <p class="text-muted small">Menghasilkan satu file <b>8355.xlsx</b> berisi satu sheet per rombel, diambil dari data aplikasi.</p>
        <div class="row g-2">
          <div class="col-md-4"><label class="form-label small mb-1">Tahun Pelajaran</label>
            <select class="form-select form-select-sm" id="e8Ta" onchange="safeCallLazyC('eksp8355GantiTa')">${daftarTa.map(t => `<option value="${nxEsc(t)}" ${t === taAktif ? 'selected' : ''}>${nxEsc(t)}</option>`).join('')}</select></div>
          ${f('e8Tgl', 'Tanggal tanda tangan', ekspTanggalIndo(new Date()), 4)}
          ${f('e8KotaTtd', 'Kota tanda tangan', B.kota_ttd, 4)}
          ${f('e8Sekolah', 'Nama Sekolah', B.sekolah)}
          ${f('e8Alamat', 'Alamat Sekolah', B.alamat)}
          ${f('e8Kec', 'Kecamatan', B.kecamatan)}
          ${f('e8Kota', 'Kota Madya', B.kota)}
          ${f('e8Pengawas', 'Nama Pengawas Sekolah', B.pengawas)}
          ${f('e8NipPengawas', 'NIP Pengawas', B.nipPengawas)}
          ${f('e8Kepala', 'Nama Kepala Sekolah', cetak.namaKepalaSekolah || B.kepala)}
          ${f('e8NipKepala', 'NIP Kepala Sekolah (boleh kosong)', cetak.nipKepalaSekolah || B.nipKepala)}
        </div>
        <hr>
        <div class="small fw-semibold mb-1">Rombel yang disertakan</div>
        <div id="e8Kelas" class="mb-3"></div>
        <button class="btn btn-primary-solid" id="btnEksp8355" onclick="safeCallLazyC('eksp8355Unduh')"><i class="bi bi-download"></i> Unduh 8355.xlsx</button>
        <div id="e8Status" class="mt-2"></div>
      </div>`;
    eksp8355GantiTa();
  } catch (e) {
    box.innerHTML = `<div class="card-surface p-3"><div class="alert alert-danger mb-0">${nxEsc(e.message)}</div></div>`;
  }
}

function eksp8355KelasTa() {
  const ta = document.getElementById('e8Ta').value;
  return eksp8355State.kelas.filter(k => k.TahunAjaran === ta)
    .sort((a, b) => ekspTingkatUrut(b) - ekspTingkatUrut(a) || String(a.NamaKelas).localeCompare(String(b.NamaKelas), 'id', { numeric: true }));
}

function eksp8355GantiTa() {
  const wrap = document.getElementById('e8Kelas');
  wrap.innerHTML = eksp8355KelasTa().map(k => {
    const n = eksp8355State.siswa.filter(s => s.KelasID === k.ID).length;
    return `<div class="form-check form-check-inline"><input class="form-check-input e8-cek" type="checkbox" id="e8k-${nxEsc(k.ID)}" value="${nxEsc(k.ID)}" ${n ? 'checked' : ''}><label class="form-check-label small" for="e8k-${nxEsc(k.ID)}">${nxEsc(k.NamaKelas)} <span class="text-muted">(${n})</span></label></div>`;
  }).join('') || '<span class="text-muted small">Tidak ada kelas pada tahun ini.</span>';
}

async function eksp8355Unduh() {
  const btn = document.getElementById('btnEksp8355');
  const stat = document.getElementById('e8Status');
  btn.disabled = true;
  try {
    stat.innerHTML = nxSpin('Menyusun file Excel…');
    await nxMuatExcelJS();
    const v = id => document.getElementById(id).value.trim();
    const c = {
      ta: v('e8Ta'), tgl: v('e8Tgl'), kotaTtd: v('e8KotaTtd'), sekolah: v('e8Sekolah'), alamat: v('e8Alamat'), kec: v('e8Kec'), kota: v('e8Kota'),
      pengawas: v('e8Pengawas'), nipPengawas: v('e8NipPengawas'), kepala: v('e8Kepala'), nipKepala: v('e8NipKepala')
    };
    const dipilih = {};
    document.querySelectorAll('.e8-cek:checked').forEach(x => { dipilih[x.value] = true; });
    const daftar = eksp8355KelasTa().filter(k => dipilih[k.ID]);
    if (!daftar.length) throw new Error('Pilih minimal satu rombel.');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Buku Induk Digital ' + c.sekolah;
    const dipakai = {};
    let totalSiswa = 0;
    daftar.forEach(k => {
      const rows = eksp8355State.siswa.filter(s => s.KelasID === k.ID).sort((a, b) => a.NamaLengkap.localeCompare(b.NamaLengkap, 'id'));
      let nama = String(k.NamaKelas).replace(/[:\\\/?*\[\]]/g, '-').substring(0, 31) || 'Kelas';
      while (dipakai[nama.toLowerCase()]) nama = nama.substring(0, 28) + '_' + (Object.keys(dipakai).length);
      dipakai[nama.toLowerCase()] = true;
      eksp8355BuatSheet(wb, nama, k, rows, c);
      totalSiswa += rows.length;
    });

    const buf = await wb.xlsx.writeBuffer();
    nxUnduhBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '8355.xlsx');
    stat.innerHTML = `<div class="alert alert-success py-2 small mb-0">File <b>8355.xlsx</b> diunduh: ${daftar.length} rombel, ${totalSiswa} siswa.</div>`;
  } catch (e) {
    stat.innerHTML = `<div class="alert alert-danger py-2 small mb-0">${nxEsc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function eksp8355BuatSheet(wb, nama, k, rows, c) {
  const ws = wb.addWorksheet(nama, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '10:11',
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    views: [{ state: 'frozen', ySplit: 11 }]
  });
  [7.4, 41.1, 6.8, 10.1, 16.1, 22.3, 20, 22.7, 13.7, 25.7, 66.7, 37.3].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const FONT = (b, sz) => ({ name: 'Times New Roman', size: sz || 12, bold: !!b });
  const tipis = { style: 'thin' };
  const garis = { top: tipis, left: tipis, bottom: tipis, right: tipis };
  const set = (addr, val, o) => {
    const cell = ws.getCell(addr);
    cell.value = val;
    o = o || {};
    cell.font = FONT(o.b, o.sz);
    cell.alignment = { horizontal: o.h || 'left', vertical: 'middle', wrapText: !!o.wrap };
    if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
    if (o.border) cell.border = garis;
    if (o.fmt) cell.numFmt = o.fmt;
    return cell;
  };

  // ── Kepala dokumen ──
  const info = [['Nama Sekolah', c.sekolah], ['Alamat Sekolah', c.alamat], ['Kecamatan', c.kec], ['Kota Madya', c.kota]];
  info.forEach((p, i) => {
    const sz = i === 3 ? 12 : 13;
    set('D' + (5 + i), p[0], { b: true, sz: sz });
    set('F' + (5 + i), ':  ' + p[1], { b: true, sz: sz });
  });
  ['H5:J5', 'H6:J6', 'H7:J7'].forEach(m => ws.mergeCells(m));
  set('H5', 'DAFTAR NAMA SISWA', { b: true, sz: 13, h: 'center' });
  set('H6', String(c.sekolah).toUpperCase(), { b: true, sz: 13, h: 'center' });
  set('H7', 'TAHUN PELAJARAN ' + c.ta, { b: true, sz: 13, h: 'center' });
  set('L5', 'Model      :   8355', { b: true, sz: 13 });
  set('L6', 'Kelas       :   ' + k.NamaKelas, { b: true, sz: 13 });
  [2, 3, 4, 5, 6, 7, 8, 9].forEach(r => { ws.getRow(r).height = r < 5 || r > 6 ? 15.75 : 16.5; });

  // ── Judul kolom (baris 10–11) ──
  const HIJAU = 'FFCCFFCC';
  const judul = ['NO.', 'NAMA', 'L/P', 'NIS', 'NISN', 'NIK', 'TEMPAT', 'TANGGAL', 'AGAMA', 'NAMA ORANG TUA', 'ALAMAT TEMPAT TINGGAL', 'NO. IJAZAH'];
  const abjad = 'ABCDEFGHIJKL';
  judul.forEach((t, i) => {
    const a = abjad[i];
    set(a + '10', t, { b: true, h: 'center', fill: HIJAU, border: true, wrap: true });
    set(a + '11', i === 6 || i === 7 ? 'LAHIR' : null, { b: true, h: 'center', fill: HIJAU, border: true });
    if (i !== 6 && i !== 7) ws.mergeCells(a + '10:' + a + '11');
  });
  ws.getRow(10).height = 26.25; ws.getRow(11).height = 26.25;

  // ── Isi data ──
  const rata = ['center', 'left', 'center', 'center', 'left', 'center', 'left', 'left', 'center', 'left', 'left', 'left'];
  rows.forEach((s, idx) => {
    const r = 12 + idx;
    const lp = /^l|laki/i.test(s.JenisKelamin) ? 'L' : /^p|perempuan/i.test(s.JenisKelamin) ? 'P' : '';
    const nis = /^\d{1,15}$/.test(s.NIS) ? Number(s.NIS) : s.NIS;
    const tgl = ekspTgl(s.TanggalLahir);
    const nilaiSel = [idx + 1, s.NamaLengkap, lp, nis, s.NISN, s.NIK, s.TempatLahir, tgl, s.Agama, s.NamaOrtu, s.Alamat, s.NoIjazah];
    nilaiSel.forEach((val, i) => {
      const o = { h: rata[i], border: true, wrap: i === 1 || i >= 9 };
      if (i === 4 || i === 5) o.fmt = '@';
      if (i === 7 && tgl instanceof Date) o.fmt = '[$-421]dd\\ mmmm\\ yyyy;@';
      set(abjad[i] + r, val === '' ? null : val, o);
    });
    ws.getRow(r).height = 37.5;
  });

  // ── Catatan & tanda tangan ──
  const f = 12 + rows.length + 1;
  set('A' + f, 'Catatan :');
  set('A' + (f + 1), 'Dibuat rangkap 3');
  set('A' + (f + 2), 'Satu lembar ke Dinas Dikmenti');
  set('A' + (f + 3), 'Satu lembar ke Sudin Dikmenti Kodya Jaksel');
  set('A' + (f + 4), 'Satu lembar arsip tertinggal');
  set('G' + f, 'Mengetahui,');
  set('G' + (f + 1), 'Pengawas Sekolah');
  set('G' + (f + 5), c.pengawas);
  if (c.nipPengawas) set('G' + (f + 6), 'NIP. ' + c.nipPengawas);
  set('K' + f, (c.kotaTtd ? c.kotaTtd + ', ' : '') + c.tgl);
  set('K' + (f + 1), 'Kepala ' + c.sekolah);
  set('K' + (f + 5), c.kepala);
  if (c.nipKepala) set('K' + (f + 6), 'NIP. ' + c.nipKepala);
}

window.nilaiUnduhTemplate = nilaiUnduhTemplate;
window.nilaiPilihFile = nilaiPilihFile;
window.nilaiKirimImpor = nilaiKirimImpor;
window.nilaiCekDuplikat = nilaiCekDuplikat;
window.nilaiHapusDuplikat = nilaiHapusDuplikat;
window.renderEksp8355 = renderEksp8355;
window.eksp8355GantiTa = eksp8355GantiTa;
window.eksp8355Unduh = eksp8355Unduh;
