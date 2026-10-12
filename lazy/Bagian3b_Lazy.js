console.log('%c[BAGIAN3B_LAZY] VERSION MARKER: 2026-09-23-v5 — jika Anda TIDAK melihat baris ini di console setelah membuka menu Cetak PDF Resmi atau Buku Induk Siswa, berarti deployment web app Anda BELUM memuat kode terbaru.', 'background:#222;color:#0f0;font-weight:bold;padding:2px 6px;');

// ════════════════════════════════════════════════════════
// LOGO LOGIN (dipanggil segera setelah aplikasi dimuat, sebelum login)
// ════════════════════════════════════════════════════════
/** PERBAIKAN: tampilkan logo sekolah di halaman Login, diambil otomatis dari
 * Pengaturan Cetak (menu Cetak PDF Resmi → Pengaturan Kop Cetak — logo yang
 * sama dipakai untuk kop cetak PDF). getPengaturanCetak() tidak butuh login
 * jadi aman dipanggil dari layar Login. Kalau logo belum pernah diupload,
 * ikon perisai bawaan tetap ditampilkan sebagai cadangan. */
function loadLoginLogo() {
  google.script.run.withSuccessHandler(res => {
    const url = res && res.success && res.data ? res.data.logoUrl : null;
    if (!url) return;
    const img = document.getElementById('loginLogo');
    if (!img) return;
    img.onload = () => {
      img.classList.remove('d-none');
      const fallback = document.getElementById('loginLogoFallback');
      if (fallback) fallback.classList.add('d-none');
    };
    img.onerror = () => { /* biarkan ikon cadangan tetap tampil kalau logo gagal dimuat */ };
    img.src = driveThumbUrl(url, 300);
  }).withFailureHandler(() => { /* diamkan saja, ikon cadangan tetap tampil */ }).getPengaturanCetak();
}

// ════════════════════════════════════════════════════════
// CETAK PDF RESMI
// ════════════════════════════════════════════════════════
/** Tampilkan pratinjau PDF memakai #previewModal (sudah ada di Index.html,
 * sebelumnya belum dipakai di mana pun). pdfId dipakai untuk iframe
 * pratinjau Drive, pdfUrl untuk tombol Unduh/Buka Tab Baru. */
function bukaPreviewPdf(pdfId, pdfUrl, judul) {
  document.getElementById('previewContent').innerHTML = pdfId
    ? '<iframe src="https://drive.google.com/file/d/' + pdfId + '/preview" width="100%" height="480" style="border:0;" allow="autoplay"></iframe>'
    : '<p class="text-secondary">Pratinjau tidak tersedia untuk dokumen ini, silakan buka langsung.</p>';
  document.getElementById('downloadBtn').href = pdfUrl;
  const titleEl = document.querySelector('#previewModal .modal-title');
  if (titleEl) titleEl.textContent = judul || 'Pratinjau Dokumen';
  new bootstrap.Modal(document.getElementById('previewModal')).show();
}

function cetakPerSiswa() {
  const nis = document.getElementById('cetakNis').value.trim();
  if (!nis) { showToast('Peringatan', 'Masukkan NIS siswa.', 'warning'); return; }
  document.getElementById('cetakSiswaResult').innerHTML = '<div class="d-flex align-items-center gap-2 small text-secondary"><span class="spinner-border spinner-border-sm"></span> Membuat dokumen PDF…</div>';
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Gagal', res.message, 'danger'); document.getElementById('cetakSiswaResult').innerHTML = ''; return; }
    document.getElementById('cetakSiswaResult').innerHTML = '<div class="alert alert-success d-flex justify-content-between align-items-center py-2 px-3 mb-0">'
      + '<span><i class="bi bi-check-circle"></i> ' + res.data.fileName + '</span>'
      + '<span><button type="button" class="btn btn-sm btn-outline-blue me-1" onclick="bukaPreviewPdf(\'' + res.data.pdfId + '\',\'' + res.data.pdfUrl + '\',\'' + res.data.fileName.replace(/'/g, "\\'") + '\')">Pratinjau</button>'
      + '<a href="' + res.data.pdfUrl + '" target="_blank" class="btn btn-sm btn-primary-solid">Buka PDF</a></span></div>';
    bukaPreviewPdf(res.data.pdfId, res.data.pdfUrl, res.data.fileName);
  }).withFailureHandler(err => { showToast('Error', err.message, 'danger'); document.getElementById('cetakSiswaResult').innerHTML=''; }).generateBukuIndukPDF(nis);
}

function cetakPerKelas() {
  const kelasId = document.getElementById('cetakKelasId').value;
  if (!kelasId) { showToast('Peringatan', 'Pilih kelas terlebih dahulu.', 'warning'); return; }
  document.getElementById('cetakKelasResult').innerHTML = '';
  document.getElementById('cetakKelasProgressWrap').classList.remove('d-none');
  processKelasBatch(kelasId, 0, 5, []);
}

function processKelasBatch(kelasId, offset, batchSize, accumulated) {
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    const all = accumulated.concat(res.data.hasil);
    const pct = res.data.total ? Math.round((res.data.processed / res.data.total) * 100) : 100;
    document.getElementById('cetakKelasProgress').style.width = pct + '%';
        document.getElementById('cetakKelasResult').innerHTML = all.map(h => h.pdfUrl
      ? '<div class="cetak-list-item"><span>' + h.nama + ' (' + h.nis + ')</span><button class="btn btn-sm btn-outline-blue py-0" onclick="bukaPreviewPdf(\'' + (h.pdfId||'') + '\',\'' + h.pdfUrl + '\',\'' + h.nama.replace(/'/g, "\\'") + '\')">Pratinjau</button></div>'
      : '<div class="cetak-list-item text-danger"><span>' + h.nama + ' (' + h.nis + ')</span><span class="small">Gagal: ' + (h.error||'-') + '</span></div>'
    ).join('');
    if (res.data.done) { showToast('Selesai', `${all.length} dokumen berhasil dicetak.`, 'success'); }
    else processKelasBatch(kelasId, res.data.nextOffset, batchSize, all);
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).generateBukuIndukKelasBatch(kelasId, offset, batchSize);
}

function loadPengaturanCetak() {
  google.script.run.withSuccessHandler(res => {
    const c = res.data || {};
    const adminOnly = isAdmin() ? '' : 'disabled';
    // CATATAN: bagian ini SENGAJA ditulis dengan penggabungan string (+) biasa,
    // BUKAN template literal bersarang (backtick di dalam backtick). Versi lama
    // memakai backtick bersarang + tanda kutip yang di-escape untuk gambar logo,
    // dan itu terbukti menjadi sumber SyntaxError "Unexpected token 'class'"
    // yang berulang kali muncul saat kode ini dikirim lewat google.script.run.
    const logoBoxHtml = c.logoUrl
      ? '<img id="logoPreviewImg" style="max-width:100%;max-height:90px;">'
      : '<span class="text-muted small">Belum ada logo</span>';
    const uploadHtml = isAdmin()
      ? '<div class="mt-2"><input type="file" id="logoFileInput" accept="image/*" class="form-control form-control-sm" onchange="uploadLogo(event)"><div id="logoUploadStatus" class="small text-muted mt-1"></div></div>'
      : '';
    const submitHtml = isAdmin()
      ? '<button type="submit" class="btn btn-primary-solid mt-3"><i class="bi bi-save"></i> Simpan Pengaturan</button>'
      : '<p class="text-muted small mt-2 mb-0">Hanya Admin yang dapat mengubah pengaturan kop cetak.</p>';
    document.getElementById('pengaturanCetakForm').innerHTML =
      '<div class="row g-3 mb-3">' +
        '<div class="col-md-3 text-center">' +
          '<div class="text-muted small mb-1">Logo Saat Ini</div>' +
          '<div id="logoPreviewBox" class="border rounded p-2" style="min-height:100px;display:flex;align-items:center;justify-content:center;">' + logoBoxHtml + '</div>' +
          uploadHtml +
        '</div>' +
        '<div class="col-md-9">' +
          '<form onsubmit="submitPengaturanCetak(event)">' +
            '<div class="row g-2">' +
              '<div class="col-md-6"><label class="form-label small">Nama Sekolah</label><input ' + adminOnly + ' name="namaSekolah" class="form-control form-control-sm" value="' + (c.namaSekolah || '') + '"></div>' +
              '<div class="col-md-3"><label class="form-label small">NPSN</label><input ' + adminOnly + ' name="npsn" class="form-control form-control-sm" value="' + (c.npsn || '') + '"></div>' +
              '<div class="col-md-3"><label class="form-label small">Tahun Ajaran Aktif</label><input ' + adminOnly + ' name="tahunAjaranAktif" class="form-control form-control-sm" value="' + (c.tahunAjaranAktif || '') + '"></div>' +
              '<div class="col-12"><label class="form-label small">Alamat Sekolah</label><input ' + adminOnly + ' name="alamatSekolah" class="form-control form-control-sm" value="' + (c.alamatSekolah || '') + '"></div>' +
              '<div class="col-md-6"><label class="form-label small">Nama Kepala Sekolah</label><input ' + adminOnly + ' name="namaKepalaSekolah" class="form-control form-control-sm" value="' + (c.namaKepalaSekolah || '') + '"></div>' +
            '</div>' +
            submitHtml +
          '</form>' +
        '</div>' +
      '</div>';
    if (c.logoUrl) {
      const imgEl = document.getElementById('logoPreviewImg');
      imgEl.onerror = function () {
        imgEl.parentElement.innerHTML = '<span class="text-muted small">Preview tidak tersedia, tapi tautan tersimpan.</span>';
      };
      imgEl.src = 'https://drive.google.com/uc?export=view&id=' + extractIdClient(c.logoUrl);
    }
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getPengaturanCetak();
}

function extractIdClient(url) {
  if (!url) return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || url.match(/id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : '';
}

/** PERBAIKAN #4: upload logo sekolah langsung dari komputer (bukan tempel URL manual) */
function uploadLogo(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Peringatan', 'Ukuran file logo maksimal 2MB.', 'warning'); return; }
  const statusEl = document.getElementById('logoUploadStatus');
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mengupload…';
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    google.script.run.withSuccessHandler(res => {
      if (res.success) { showToast('Berhasil', res.message, 'success'); loadPengaturanCetak(); }
      else { statusEl.textContent = ''; showToast('Gagal', res.message, 'danger'); }
    }).withFailureHandler(err => { statusEl.textContent = ''; showToast('Error', err.message, 'danger'); })
      .uploadLogoSekolah(AppState.token, base64, file.name, file.type);
  };
  reader.readAsDataURL(file);
}

function submitPengaturanCetak(e) {
  e.preventDefault();
  const fd = new FormData(e.target); const obj = {}; fd.forEach((v, k) => obj[k] = v);
  google.script.run.withSuccessHandler(res => {
    if (res.success) showToast('Berhasil', res.message, 'success'); else showToast('Gagal', res.message, 'danger');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).savePengaturanCetak(AppState.token, obj);
}

// ════════════════════════════════════════════════════════
// MANAJEMEN PENGGUNA (Admin)
// ════════════════════════════════════════════════════════
// PERBAIKAN: array cache + onclick berdasarkan index, BUKAN JSON.stringify(u)
// ditempel langsung ke atribut onclick. Cara lama rawan rusak kalau ada nama
// pengguna yang mengandung tanda kutip, dan juga memakai template literal
// bersarang (sumber SyntaxError yang sama seperti di loadPengaturanCetak).
let PenggunaTableCache = [];

function loadPenggunaTable() {
  document.getElementById('penggunaTableWrap').innerHTML = '<div class="skeleton-block"></div>';
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { document.getElementById('penggunaTableWrap').innerHTML = '<p class="text-secondary">' + res.message + '</p>'; return; }
    PenggunaTableCache = res.data || [];
    let rows = '';
    for (let i = 0; i < PenggunaTableCache.length; i++) {
      const u = PenggunaTableCache[i];
      rows += '<tr><td>' + u.Username + '</td><td>' + u.Nama + '</td><td>' + u.Role + '</td><td>' + u.StatusAktif + '</td>' +
        '<td class="text-end"><button class="btn btn-sm btn-outline-blue" onclick="openUserFormByIndex(' + i + ')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-danger ms-1" onclick="confirmDeleteGeneric(\'deleteUser\',\'' + u.ID + '\',loadPenggunaTable)"><i class="bi bi-trash"></i></button></td></tr>';
    }
    document.getElementById('penggunaTableWrap').innerHTML =
      '<div class="table-responsive-wrap"><table class="table-ledger">' +
        '<thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Status</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getAllUsers(AppState.token);
}

function openUserFormByIndex(i) {
  openUserForm(PenggunaTableCache[i]);
}

function openUserForm(u) {
  document.getElementById('genericModalTitle').textContent = u ? 'Edit Akun' : 'Tambah Akun Staff TU';
  document.getElementById('genericModalBody').innerHTML =
    '<form onsubmit="submitUser(event)">' +
      '<input type="hidden" name="ID" value="' + (u ? u.ID : '') + '">' +
      '<div class="row g-2">' +
        '<div class="col-md-6"><label class="form-label small">Username *</label><input required name="Username" class="form-control form-control-sm" value="' + (u ? u.Username : '') + '"></div>' +
        '<div class="col-md-6"><label class="form-label small">Nama *</label><input required name="Nama" class="form-control form-control-sm" value="' + (u ? u.Nama : '') + '"></div>' +
        '<div class="col-md-6"><label class="form-label small">Role</label><select name="Role" class="form-select form-select-sm"><option>Staff TU</option><option>Admin</option></select></div>' +
        '<div class="col-md-6"><label class="form-label small">Status</label><select name="StatusAktif" class="form-select form-select-sm"><option>Aktif</option><option>Nonaktif</option></select></div>' +
        '<div class="col-12"><label class="form-label small">' + (u ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *') + '</label><input ' + (u ? '' : 'required') + ' type="password" name="Password" class="form-control form-control-sm"></div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary-solid w-100 mt-3"><i class="bi bi-save"></i> Simpan</button>' +
    '</form>';
  new bootstrap.Modal(document.getElementById('genericModal')).show();
}

function submitUser(e) {
  e.preventDefault();
  const fd = new FormData(e.target); const obj = {}; fd.forEach((v, k) => obj[k] = v);
  if (!obj.ID) delete obj.ID;
  if (!obj.Password) delete obj.Password;
  google.script.run.withSuccessHandler(res => {
    if (res.success) { showToast('Berhasil', res.message, 'success'); bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide(); loadPenggunaTable(); }
    else showToast('Gagal', res.message, 'danger');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).saveUser(AppState.token, obj);
}

// ════════════════════════════════════════════════════════
// UPLOAD FOTO SISWA & BERKAS IJAZAH (dipanggil dari tab Biodata Diri /
// Riwayat Pendidikan di halaman Buku Induk Siswa). Dipindah ke modul lazy
// ini (bukan di halaman statis) supaya halaman awal tetap ringan.
// ════════════════════════════════════════════════════════
/** Membangun kotak upload foto siswa dan menyisipkannya ke placeholder
 * #fotoUploadSlot yang dibuat oleh Bagian2 (halaman statis sengaja dibuat
 * kosong di sana supaya ukurannya tetap kecil). Dipanggil setelah tab
 * Biodata Diri selesai dirender. */
function enhanceBiodataTab(b) {
  const slot = document.getElementById('fotoUploadSlot');
  if (!slot) return;
  const fotoPreviewHtml = b.FotoURL
    ? '<img src="' + driveThumbUrl(b.FotoURL, 300) + '" style="width:100%;height:100%;object-fit:cover;">'
    : (b.NamaLengkap || '?').charAt(0);
  slot.innerHTML = '<div class="d-flex gap-3 align-items-start mb-3 flex-wrap">'
    + '<div><div class="siswa-avatar" id="fotoSiswaPreview" style="width:100px;height:100px;font-size:2rem;overflow:hidden;">' + fotoPreviewHtml + '</div></div>'
    + '<div class="flex-grow-1" style="min-width:220px;">'
    + '<label class="form-label small">Foto Diri Siswa</label>'
    + '<input type="file" id="fotoSiswaInput" accept="image/*" class="form-control form-control-sm">'
    + '<div id="fotoSiswaStatus" class="small text-muted mt-1">Format JPG/PNG, maksimal 2MB.</div>'
    + '</div></div>';
  const input = document.getElementById('fotoSiswaInput');
  if (input) input.addEventListener('change', onFotoSiswaChange);
}

/** Sama seperti enhanceBiodataTab, untuk kotak upload berkas ijazah pada
 * tab Riwayat Pendidikan (placeholder #ijazahUploadSlot). */
function enhanceRiwayatTab(r) {
  const slot = document.getElementById('ijazahUploadSlot');
  if (!slot) return;
  const ijazahStatusHtml = r.IjazahURL
    ? '<a href="' + r.IjazahURL + '" target="_blank"><i class="bi bi-file-earmark-check"></i> Lihat berkas ijazah tersimpan</a>'
    : 'Belum ada berkas ijazah diunggah.';
  slot.innerHTML = '<div class="row g-2">'
    + '<div class="col-md-6"><label class="form-label small">Upload Berkas Ijazah (PDF/Gambar, maks. 5MB)</label>'
    + '<input type="file" id="ijazahSiswaInput" accept=".pdf,image/*" class="form-control form-control-sm"></div>'
    + '<div class="col-md-6 d-flex align-items-end"><div id="ijazahSiswaStatus" class="small text-muted">' + ijazahStatusHtml + '</div></div>'
    + '</div>';
  const input = document.getElementById('ijazahSiswaInput');
  if (input) input.addEventListener('change', onIjazahSiswaChange);
}

function onFotoSiswaChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Peringatan', 'Ukuran foto maksimal 2MB.', 'warning'); return; }
  const statusEl = document.getElementById('fotoSiswaStatus');
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mengupload…';
  const nis = currentProfilData.biodata.NIS;
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    google.script.run.withSuccessHandler(res => {
      if (res.success) { showToast('Berhasil', res.message, 'success'); loadProfilSiswa(nis); }
      else { statusEl.textContent = 'Format JPG/PNG, maksimal 2MB.'; showToast('Gagal', res.message, 'danger'); }
    }).withFailureHandler(err => { statusEl.textContent = 'Format JPG/PNG, maksimal 2MB.'; showToast('Error', err.message, 'danger'); })
      .uploadFotoSiswa(AppState.token, nis, base64, file.name, file.type);
  };
  reader.readAsDataURL(file);
}

function onIjazahSiswaChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Peringatan', 'Ukuran berkas ijazah maksimal 5MB.', 'warning'); return; }
  const statusEl = document.getElementById('ijazahSiswaStatus');
  statusEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mengupload…';
  const nis = currentProfilData.biodata.NIS;
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    google.script.run.withSuccessHandler(res => {
      if (res.success) { showToast('Berhasil', res.message, 'success'); loadProfilSiswa(nis); }
      else { statusEl.textContent = 'Belum ada berkas ijazah diunggah.'; showToast('Gagal', res.message, 'danger'); }
    }).withFailureHandler(err => { statusEl.textContent = 'Belum ada berkas ijazah diunggah.'; showToast('Error', err.message, 'danger'); })
      .uploadIjazahSiswa(AppState.token, nis, base64, file.name, file.type);
  };
  reader.readAsDataURL(file);
}

// ════════════════════════════════════════════════════════
// ABSENSI (dropdown Kelas → Siswa + rekap yang bisa diedit/dihapus).
// Dipindah ke modul lazy ini (bukan di halaman statis Bagian3) supaya
// halaman awal tetap ringan — lihat catatan di Bagian3_Absensi_Ekskul_
// Kelulusan.html. Dipicu lewat ensureLazyModule() saat menu Absensi dibuka
// (lihat navigateTo() di Bagian1_State_Auth_Dashboard.html).
// ════════════════════════════════════════════════════════
let AbsensiCache = [];

/** Dropdown Kelas → Siswa di atas tabel rekap absensi. */
function onAbsensiKelasChange() {
  const kelasId = document.getElementById('absensiKelasSelect').value;
  const siswaSel = document.getElementById('absensiSiswaSelect');
  if (!kelasId) { siswaSel.innerHTML = '<option value="">Semua Siswa</option>'; loadRekapAbsensi(); return; }
  google.script.run.withSuccessHandler(res => {
    siswaSel.innerHTML = '<option value="">Semua Siswa di Kelas Ini</option>' + (res.data || []).map(s => '<option value="' + s.NIS + '">' + s.NamaLengkap + ' (' + s.NIS + ')</option>').join('');
    loadRekapAbsensi();
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getSiswaByKelas(kelasId);
}

function loadRekapAbsensi() {
  const filters = { nis: document.getElementById('absensiSiswaSelect').value, dari: document.getElementById('absensiDari').value, sampai: document.getElementById('absensiSampai').value };
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    AbsensiCache = res.data.data || [];
    const s = res.data.summary;
    document.getElementById('absensiSummary').innerHTML = ['Hadir','Sakit','Izin','Alpa'].map(k => kpiCard('bi-calendar2-check', k==='Hadir'?'success':(k==='Alpa'?'danger':'warning'), s[k], k)).join('');
    document.getElementById('absensiTableWrap').innerHTML = AbsensiCache.length ? '<div class="table-responsive-wrap"><table class="table-ledger">'
      + '<thead><tr><th>NIS</th><th>Tanggal</th><th>Status</th><th>Keterangan</th><th></th></tr></thead>'
      + '<tbody>' + AbsensiCache.map((a, i) => '<tr><td>' + a.NIS + '</td><td>' + a.Tanggal + '</td><td>' + a.Status + '</td><td>' + (a.Keterangan || '-') + '</td>'
        + '<td class="text-end text-nowrap">'
        + '<button class="btn btn-sm btn-outline-blue" onclick="editAbsensi(' + i + ')"><i class="bi bi-pencil"></i></button>'
        + (isAdmin() ? '<button class="btn btn-sm btn-danger" onclick="confirmDeleteGeneric(\'deleteAbsensi\',\'' + a.ID + '\',loadRekapAbsensi)"><i class="bi bi-trash"></i></button>' : '')
        + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="text-secondary">Belum ada data absensi untuk filter ini.</p>';
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getRekapAbsensi(filters);
}

/** existing diisi kalau dipanggil dari tombol Edit (lihat editAbsensi). */
function openAbsensiInputModal(existing) {
  const kelasOptions = AppState.cache.kelas.map(k => '<option value="' + k.ID + '">' + k.NamaKelas + '</option>').join('');
  document.getElementById('genericModalTitle').textContent = existing ? 'Edit Absensi' : 'Input Absensi Harian';
  const statusOptions = ['Hadir', 'Sakit', 'Izin', 'Alpa'].map(st => '<option ' + (existing && existing.Status === st ? 'selected' : '') + '>' + st + '</option>').join('');
  const siswaAwal = existing
    ? '<option value="' + existing.NIS + '" selected>' + existing.NIS + '</option>'
    : '<option value="">Pilih kelas dahulu</option>';
  document.getElementById('genericModalBody').innerHTML = '<form onsubmit="submitAbsensi(event)">'
    + '<input type="hidden" name="ID" value="' + (existing ? existing.ID : '') + '">'
    + '<div class="row g-2">'
    + '<div class="col-md-6"><label class="form-label small">Pilih Kelas *</label>'
    + '<select ' + (existing ? '' : 'required') + ' id="formAbsensiKelas" class="form-select form-select-sm" onchange="onFormAbsensiKelasChange()" ' + (existing ? 'disabled' : '') + '>'
    + '<option value="">— Pilih Kelas —</option>' + kelasOptions + '</select></div>'
    + '<div class="col-md-6"><label class="form-label small">Pilih Siswa *</label>'
    + '<select required name="NIS" id="formAbsensiSiswa" class="form-select form-select-sm" ' + (existing ? '' : 'disabled') + '>' + siswaAwal + '</select></div>'
    + '<div class="col-md-6"><label class="form-label small">Tanggal *</label><input required type="date" name="Tanggal" class="form-control form-control-sm" value="' + (existing ? existing.Tanggal : new Date().toISOString().slice(0, 10)) + '"></div>'
    + '<div class="col-md-6"><label class="form-label small">Status</label><select name="Status" class="form-select form-select-sm">' + statusOptions + '</select></div>'
    + '<div class="col-12"><label class="form-label small">Keterangan</label><input name="Keterangan" class="form-control form-control-sm" value="' + (existing ? (existing.Keterangan || '') : '') + '"></div>'
    + '</div><button type="submit" class="btn btn-primary-solid w-100 mt-3"><i class="bi bi-save"></i> Simpan</button></form>';
  new bootstrap.Modal(document.getElementById('genericModal')).show();
}

function onFormAbsensiKelasChange() {
  const kelasId = document.getElementById('formAbsensiKelas').value;
  const siswaSel = document.getElementById('formAbsensiSiswa');
  if (!kelasId) { siswaSel.innerHTML = '<option value="">Pilih kelas dahulu</option>'; siswaSel.disabled = true; return; }
  siswaSel.disabled = true;
  siswaSel.innerHTML = '<option value="">Memuat…</option>';
  google.script.run.withSuccessHandler(res => {
    siswaSel.disabled = false;
    siswaSel.innerHTML = '<option value="">— Pilih Siswa —</option>' + (res.data || []).map(s => '<option value="' + s.NIS + '">' + s.NamaLengkap + ' (' + s.NIS + ')</option>').join('');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getSiswaByKelas(kelasId);
}

/** Dipanggil dari tombol pensil (Edit) di tabel rekap absensi. */
function editAbsensi(index) {
  const data = AbsensiCache[index];
  if (!data) return;
  openAbsensiInputModal(data);
}

function submitAbsensi(e) {
  e.preventDefault();
  const fd = new FormData(e.target); const obj = {}; fd.forEach((v, k) => obj[k] = v);
  if (!obj.ID) delete obj.ID;
  google.script.run.withSuccessHandler(res => {
    if (res.success) { showToast('Berhasil', res.message, 'success'); bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide(); loadRekapAbsensi(); }
    else showToast('Gagal', res.message, 'danger');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).saveAbsensiSatuan(AppState.token, obj);
}

// Sandbox Google menjalankan kode ini dalam strict mode, sehingga fungsi di
// atas TIDAK otomatis menjadi global. Baris berikut menempelkannya secara
// eksplisit ke window supaya bisa dipanggil dari tombol/menu di halaman utama.
window.cetakPerSiswa = cetakPerSiswa;
window.cetakPerKelas = cetakPerKelas;
// ═══════════════════════════════════════════════════════════════
// FITUR 4 — IMPOR EXCEL DAPODIK  (sisi tampilan / browser)
// Tempel di file Bagian3b_Lazy.html, di DALAM tag <script>, tepat
// SEBELUM baris:   window.bukaPreviewPdf = bukaPreviewPdf;
// Lalu tambahkan 3 baris window.* yang ada di paling bawah file ini
// ke blok pendaftaran window.* (dekat baris window.bukaPreviewPdf).
// ═══════════════════════════════════════════════════════════════

let imporState = { baris: [], tanpaNis: [], rombel: [], kelasAda: [], nisAda: {}, jalan: false };
const IMPOR_UKURAN_BATCH = 5;

// ── Pembersih teks ──
function imporTeks(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  // 'â€“' = tanda strip (–) yang rusak saat diunduh dari Dapodik
  const s = String(v).replace(/â€“/g, '–').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return /^[-–.]+$/.test(s) ? '' : s; // tanda "-" saja di Dapodik berarti kosong
}
function imporAngka(v) { const s = imporTeks(v); return (s === '' || s === '0') ? '' : s; }
function imporWilayah(s, awalan) {
  s = s.replace(awalan, '').trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return s;
}
// Nama rombel Dapodik (10-A) dibandingkan dengan NamaKelas (X-A) lewat bentuk baku
function imporNorm(s) {
  return String(s || '').toLowerCase().replace(/[\s\-._]/g, '').replace(/^12/, 'xii').replace(/^11/, 'xi').replace(/^10/, 'x');
}
function imporTingkat(nama) {
  const m = String(nama || '').toUpperCase().replace(/\s/g, '');
  if (/^(12|XII)/.test(m)) return 'XII';
  if (/^(11|XI)/.test(m)) return 'XI';
  if (/^(10|X)/.test(m)) return 'X';
  return '';
}

// ── Membaca file Excel Dapodik → daftar objek {judul kolom: nilai} ──
function imporBacaWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  const h = aoa.findIndex(r => r.some(c => String(c).trim() === 'NIPD') && r.some(c => String(c).trim() === 'Nama'));
  if (h < 0) throw new Error('Baris judul kolom (NIPD, Nama, ...) tidak ditemukan. Pastikan ini file "Daftar Peserta Didik" dari Dapodik.');
  const induk = aoa[h], sub = aoa[h + 1] || [];
  const adaSub = sub.some(c => String(c).trim() === 'Tahun Lahir');
  const kunci = []; let grup = '';
  induk.forEach((c, i) => {
    const t = String(c).replace(/\s+/g, ' ').trim();
    if (/^Data (Ayah|Ibu|Wali)$/.test(t)) grup = t.replace('Data ', '');
    else if (t) grup = '';
    if (grup && adaSub) kunci[i] = grup + '|' + String(sub[i] || '').replace(/\s+/g, ' ').trim();
    else kunci[i] = t;
  });
  const hasil = [];
  aoa.slice(h + (adaSub ? 2 : 1)).forEach(r => {
    const d = {};
    kunci.forEach((k, i) => { if (k) d[k] = r[i]; });
    if (imporTeks(d['Nama'])) hasil.push(d);
  });
  return hasil;
}

// ── Memetakan satu baris Dapodik ke bentuk data aplikasi ──
function imporOrtu(d, grup, jenis) {
  const T = imporTeks;
  const nama = T(d[grup + '|Nama']);
  if (!nama) return null;
  let pekerjaan = T(d[grup + '|Pekerjaan']), penghasilan = T(d[grup + '|Penghasilan']);
  const wafat = /meninggal/i.test(pekerjaan);
  if (wafat) { pekerjaan = ''; penghasilan = ''; }
  return {
    JenisOrtu: jenis, Nama: nama, NIK: T(d[grup + '|NIK']),
    TahunLahirAngka: imporAngka(d[grup + '|Tahun Lahir']),
    PendidikanTerakhir: T(d[grup + '|Jenjang Pendidikan']),
    Pekerjaan: pekerjaan, Penghasilan: penghasilan, Keadaan: wafat ? 'Meninggal' : 'Hidup'
  };
}

function imporPetakan(d) {
  const T = imporTeks, A = imporAngka;
  const nis = T(d['NIPD']);
  const jk = T(d['JK']).toUpperCase();
  const rt = A(d['RT']), rw = A(d['RW']);
  const alamat = [T(d['Alamat']), rt ? 'RT ' + String(rt).padStart(3, '0') : '', rw ? 'RW ' + String(rw).padStart(3, '0') : '', T(d['Dusun'])]
    .filter(Boolean).join(', ');
  const jarak = imporAngka(d['Jarak Rumah ke Sekolah (KM)']);
  const wali = imporOrtu(d, 'Wali', 'Wali');
  const ortu = [imporOrtu(d, 'Ayah', 'Ayah'), imporOrtu(d, 'Ibu', 'Ibu')].filter(Boolean);
  return {
    nis: nis, nama: T(d['Nama']), rombel: T(d['Rombel Saat Ini']),
    biodata: {
      NIS: nis, NamaLengkap: T(d['Nama']), NISN: T(d['NISN']),
      JenisKelamin: jk === 'L' ? 'Laki-laki' : (jk === 'P' ? 'Perempuan' : ''),
      TempatLahir: T(d['Tempat Lahir']), TanggalLahir: T(d['Tanggal Lahir']), Agama: T(d['Agama']),
      NIK: T(d['NIK']), NomorKK: T(d['No KK']), BerkebutuhanKhusus: T(d['Kebutuhan Khusus']),
      NoRegistrasiAktaLahir: T(d['No Registrasi Akta Lahir']),
      AnakKe: T(d['Anak ke-berapa']), JumlahSaudara: T(d['Jml. Saudara Kandung']), Status: 'Aktif'
    },
    ortu: ortu,
    tempatTinggal: {
      Alamat: alamat,
      DesaKelurahan: imporWilayah(T(d['Kelurahan']), /^(Desa\/Kel\.|Kel\.|Desa)\s*/i),
      Kecamatan: imporWilayah(T(d['Kecamatan']), /^Kec\.\s*/i),
      KodePos: T(d['Kode Pos']), Telepon: T(d['HP']) || T(d['Telepon']),
      TinggalBersama: T(d['Jenis Tinggal']), ModaTransportasi: T(d['Alat Transportasi']),
      JarakKeSekolah: jarak ? jarak + ' km' : '',
      KeteranganWali: wali ? ('Wali: ' + wali.Nama + (wali.Pekerjaan ? ' (' + wali.Pekerjaan + ')' : '')) : ''
    },
    kesehatan: { TinggiBadan: A(d['Tinggi Badan']), BeratBadan: A(d['Berat Badan']), LingkarKepala: A(d['Lingkar Kepala']) },
    riwayatPendidikan: { NamaSekolahAsal: T(d['Sekolah Asal']), NoKIPPIP: T(d['Nomor KIP']), JalurAsalData: 'Impor Dapodik' }
  };
}

// ═══════════ TAMPILAN HALAMAN ═══════════
function renderImporDapodik() {
  imporState = { baris: [], tanpaNis: [], rombel: [], kelasAda: [], nisAda: {}, jalan: false };
  document.getElementById('imporContent').innerHTML = `
    <div class="card-surface p-3 mb-3">
      <h6><i class="bi bi-file-earmark-excel"></i> Langkah 1 — Pilih file Excel dari Dapodik</h6>
      <p class="text-secondary small mb-2">Gunakan file "Daftar Peserta Didik" hasil unduhan Dapodik (.xlsx). Tidak ada data yang tersimpan sebelum Anda menekan tombol Mulai Impor.</p>
      <div class="row g-2 align-items-end">
        <div class="col-md-6"><input type="file" class="form-control form-control-sm" accept=".xlsx,.xls" onchange="imporPilihFile(this)"></div>
        <div class="col-md-6"><label class="form-label small mb-1">Jika NIS sudah ada di aplikasi</label>
          <select id="imporMode" class="form-select form-select-sm">
            <option value="isi-kosong">Isi hanya kolom yang masih kosong (disarankan)</option>
            <option value="lewati">Lewati siswa itu</option>
            <option value="timpa">Timpa dengan data Dapodik</option>
          </select></div>
      </div>
    </div>
    <div id="imporPratinjau"></div>
    <div id="imporProgres"></div>`;
}

function imporPilihFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('Error', 'Pembaca Excel belum termuat. Muat ulang halaman lalu coba lagi.', 'danger'); return; }
  document.getElementById('imporPratinjau').innerHTML = '<div class="skeleton-block"></div>';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const semua = imporBacaWorkbook(e.target.result).map(imporPetakan);
      imporState.baris = semua.filter(x => x.nis);
      imporState.tanpaNis = semua.filter(x => !x.nis);
      imporAmbilDataAplikasi();
    } catch (err) {
      document.getElementById('imporPratinjau').innerHTML = '';
      showToast('Gagal membaca file', err.message, 'danger');
    }
  };
  reader.readAsArrayBuffer(file);
}

function imporAmbilDataAplikasi() {
  google.script.run.withSuccessHandler(rs => {
    imporState.nisAda = {};
    (rs.data || []).forEach(s => { imporState.nisAda[String(s.NIS)] = true; });
    google.script.run.withSuccessHandler(rk => {
      imporState.kelasAda = rk.data || [];
      imporGambarPratinjau();
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getAllData('Kelas');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getAllData('Siswa');
}

function imporGambarPratinjau() {
  const st = imporState;
  const jmlAda = st.baris.filter(x => st.nisAda[x.nis]).length;
  const hitung = {};
  st.baris.forEach(x => { hitung[x.rombel] = (hitung[x.rombel] || 0) + 1; });
  st.rombel = Object.keys(hitung).sort();

  const taUmum = {};
  st.kelasAda.forEach(k => { if (k.TahunAjaran) taUmum[k.TahunAjaran] = (taUmum[k.TahunAjaran] || 0) + 1; });
  const taDefault = Object.keys(taUmum).sort((a, b) => taUmum[b] - taUmum[a])[0] || '';

  const barisMap = st.rombel.map((nama, i) => {
    const cocok = st.kelasAda.find(k => imporNorm(k.NamaKelas) === imporNorm(nama));
    const opsi = st.kelasAda.map(k => `<option value="${k.ID}" ${cocok && cocok.ID === k.ID ? 'selected' : ''}>${k.NamaKelas} (${k.TahunAjaran || '-'})</option>`).join('');
    return `<tr><td>${nama || '(kosong)'}</td><td>${hitung[nama]} siswa</td>
      <td><select id="imporMap_${i}" class="form-select form-select-sm"><option value="__baru__" ${cocok ? '' : 'selected'}>➕ Buat kelas baru "${nama}"</option>${opsi}</select></td></tr>`;
  }).join('');

  const tanpaNisHtml = st.tanpaNis.length
    ? `<div class="alert alert-warning py-2 small mb-3"><b>${st.tanpaNis.length} siswa tidak punya NIPD dan akan dilewati:</b> ${st.tanpaNis.map(x => x.nama).join(', ')}. Lengkapi NIPD-nya di Dapodik lalu impor ulang.</div>` : '';

  document.getElementById('imporPratinjau').innerHTML = `
    <div class="card-surface p-3 mb-3">
      <h6><i class="bi bi-eye"></i> Langkah 2 — Periksa sebelum impor</h6>
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3"><div class="kpi-card"><div class="kpi-value">${st.baris.length}</div><div class="kpi-label">Siswa siap diimpor</div></div></div>
        <div class="col-6 col-md-3"><div class="kpi-card"><div class="kpi-value">${st.baris.length - jmlAda}</div><div class="kpi-label">Siswa baru</div></div></div>
        <div class="col-6 col-md-3"><div class="kpi-card"><div class="kpi-value">${jmlAda}</div><div class="kpi-label">Sudah ada di aplikasi</div></div></div>
        <div class="col-6 col-md-3"><div class="kpi-card"><div class="kpi-value">${st.tanpaNis.length}</div><div class="kpi-label">Dilewati (tanpa NIPD)</div></div></div>
      </div>
      ${tanpaNisHtml}
      <div class="table-responsive-wrap mb-3"><table class="table-ledger">
        <thead><tr><th>Rombel di Dapodik</th><th>Jumlah</th><th>Masuk ke kelas di aplikasi</th></tr></thead>
        <tbody>${barisMap}</tbody></table></div>
      <div class="row g-2 mb-3">
        <div class="col-md-4"><label class="form-label small">Tahun Ajaran (untuk kelas baru)</label>
          <input id="imporTA" class="form-control form-control-sm" value="${taDefault}" placeholder="2026/2027"></div>
        <div class="col-md-4"><label class="form-label small">Kapasitas kelas baru</label>
          <input id="imporKap" type="number" class="form-control form-control-sm" value="36"></div>
      </div>
      <p class="text-secondary small">Tidak ikut diimpor karena tidak ada di Dapodik: Kabupaten/Kota, Provinsi, Tahun Masuk, dan Waktu Tempuh. Isi manual di profil siswa bila perlu.</p>
      <button class="btn btn-primary-solid" id="btnMulaiImpor" onclick="imporMulai()"><i class="bi bi-cloud-upload"></i> Mulai Impor</button>
    </div>`;
}

// ═══════════ PROSES IMPOR ═══════════
function imporMulai() {
  const st = imporState;
  if (st.jalan) return;
  const taEl = document.getElementById('imporTA'), kapEl = document.getElementById('imporKap');
  const pilihan = {}; const baru = [];
  st.rombel.forEach((nama, i) => {
    const v = document.getElementById('imporMap_' + i).value;
    pilihan[nama] = v;
    if (v === '__baru__') baru.push({ nama: nama, tingkat: imporTingkat(nama), tahunAjaran: taEl.value.trim(), kapasitas: Number(kapEl.value) || 36 });
  });
  if (baru.length && !taEl.value.trim()) { showToast('Peringatan', 'Isi Tahun Ajaran untuk kelas baru.', 'warning'); return; }

  st.jalan = true;
  document.getElementById('btnMulaiImpor').disabled = true;
  const rekap = { baru: 0, diperbarui: 0, dilewati: 0, gagal: [] };
  imporTampilProgres(0, st.baris.length, rekap, 'Menyiapkan kolom dan kelas…');

  google.script.run.withSuccessHandler(r1 => {
    if (!r1 || !r1.success) { imporSelesaiGagal(r1 && r1.message); return; }
    const lanjut = peta => {
      st.baris.forEach(x => { x.biodata.KelasID = pilihan[x.rombel] === '__baru__' ? (peta[x.rombel] || '') : pilihan[x.rombel]; });
      imporKirimBatch(0, rekap);
    };
    if (!baru.length) { lanjut({}); return; }
    google.script.run.withSuccessHandler(r2 => {
      if (!r2 || !r2.success) { imporSelesaiGagal(r2 && r2.message); return; }
      lanjut((r2.data && r2.data.peta) || {});
    }).withFailureHandler(err => imporSelesaiGagal(err.message)).imporSiapkanKelas(AppState.token, baru);
  }).withFailureHandler(err => imporSelesaiGagal(err.message)).imporSiapkanKolomTeks(AppState.token);
}

function imporKirimBatch(mulai, rekap) {
  const st = imporState;
  if (mulai >= st.baris.length) { imporSelesai(rekap); return; }
  const mode = document.getElementById('imporMode').value;
  const potong = st.baris.slice(mulai, mulai + IMPOR_UKURAN_BATCH);
  google.script.run.withSuccessHandler(res => {
    if (res && res.success && res.data) {
      rekap.baru += res.data.baru; rekap.diperbarui += res.data.diperbarui; rekap.dilewati += res.data.dilewati;
      res.data.gagal.forEach(g => rekap.gagal.push(g));
    } else {
      potong.forEach(x => rekap.gagal.push({ nis: x.nis, nama: x.nama, alasan: (res && res.message) || 'Respons kosong dari server' }));
    }
    imporTampilProgres(Math.min(mulai + IMPOR_UKURAN_BATCH, st.baris.length), st.baris.length, rekap, 'Mengimpor…');
    imporKirimBatch(mulai + IMPOR_UKURAN_BATCH, rekap);
  }).withFailureHandler(err => {
    potong.forEach(x => rekap.gagal.push({ nis: x.nis, nama: x.nama, alasan: err.message }));
    imporTampilProgres(Math.min(mulai + IMPOR_UKURAN_BATCH, st.baris.length), st.baris.length, rekap, 'Mengimpor…');
    imporKirimBatch(mulai + IMPOR_UKURAN_BATCH, rekap);
  }).imporDapodikBatch(AppState.token, potong, mode);
}

function imporTampilProgres(selesai, total, rekap, label) {
  const persen = total ? Math.round(selesai / total * 100) : 0;
  document.getElementById('imporProgres').innerHTML = `
    <div class="card-surface p-3 mb-3">
      <div class="d-flex justify-content-between small mb-1"><span>${label}</span><span>${selesai} / ${total} siswa</span></div>
      <div class="progress" style="height:10px;"><div class="progress-bar" style="width:${persen}%"></div></div>
      <div class="small text-secondary mt-2">Baru: ${rekap.baru} • Diperbarui: ${rekap.diperbarui} • Dilewati: ${rekap.dilewati} • Gagal: ${rekap.gagal.length}</div>
      <div class="small text-secondary">Jangan tutup atau pindah dari halaman ini sampai selesai.</div>
    </div>`;
}

function imporSelesaiGagal(pesan) {
  imporState.jalan = false;
  const btn = document.getElementById('btnMulaiImpor'); if (btn) btn.disabled = false;
  document.getElementById('imporProgres').innerHTML = `<div class="alert alert-danger">Impor dihentikan: ${pesan || 'terjadi kesalahan.'}</div>`;
}

function imporSelesai(rekap) {
  imporState.jalan = false;
  google.script.run.withSuccessHandler(rk => { AppState.cache.kelas = rk.data || AppState.cache.kelas; }).getAllData('Kelas');
  const gagalHtml = rekap.gagal.length
    ? `<h6 class="mt-3">Siswa yang gagal diimpor</h6><ul class="small">${rekap.gagal.map(g => `<li>${g.nama} (NIS ${g.nis}): ${g.alasan}</li>`).join('')}</ul>` : '';
  const lewatiHtml = imporState.tanpaNis.length
    ? `<p class="small text-secondary">Dilewati karena tanpa NIPD: ${imporState.tanpaNis.map(x => x.nama).join(', ')}.</p>` : '';
  document.getElementById('imporProgres').innerHTML = `
    <div class="card-surface p-3 mb-3">
      <h6><i class="bi bi-check-circle text-success"></i> Impor selesai</h6>
      <p class="mb-1">Siswa baru: <b>${rekap.baru}</b> • Diperbarui: <b>${rekap.diperbarui}</b> • Dilewati (sudah ada): <b>${rekap.dilewati}</b> • Gagal: <b>${rekap.gagal.length}</b></p>
      ${lewatiHtml}${gagalHtml}
      <a href="javascript:void(0)" onclick="navigateTo('katalog')" class="btn btn-outline-blue btn-sm mt-2">Lihat Katalog Buku Induk</a>
    </div>`;
  showToast('Selesai', 'Impor Dapodik selesai.', rekap.gagal.length ? 'warning' : 'success');
}

// ── Tambahkan 3 baris ini ke blok pendaftaran window.* ──
window.renderImporDapodik = renderImporDapodik;
window.imporPilihFile = imporPilihFile;
window.imporMulai = imporMulai;
window.bukaPreviewPdf = bukaPreviewPdf;
window.processKelasBatch = processKelasBatch;
window.loadPengaturanCetak = loadPengaturanCetak;
window.extractIdClient = extractIdClient;
window.uploadLogo = uploadLogo;
window.submitPengaturanCetak = submitPengaturanCetak;
window.loadPenggunaTable = loadPenggunaTable;
window.openUserForm = openUserForm;
window.openUserFormByIndex = openUserFormByIndex;
window.submitUser = submitUser;
window.enhanceBiodataTab = enhanceBiodataTab;
window.enhanceRiwayatTab = enhanceRiwayatTab;
window.onFotoSiswaChange = onFotoSiswaChange;
window.onIjazahSiswaChange = onIjazahSiswaChange;
window.loadLoginLogo = loadLoginLogo;
window.onAbsensiKelasChange = onAbsensiKelasChange;
window.loadRekapAbsensi = loadRekapAbsensi;
window.openAbsensiInputModal = openAbsensiInputModal;
window.onFormAbsensiKelasChange = onFormAbsensiKelasChange;
window.editAbsensi = editAbsensi;
window.submitAbsensi = submitAbsensi;
// PENANDA AKHIR BAGIAN 3 — jika baris ini tidak terlihat di ujung
