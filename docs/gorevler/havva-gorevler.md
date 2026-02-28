# Sprint 1 — Havva CECEN Gorevleri

**Rol**: Data Engineer + Admin
**GitHub**: @havvacecen
**Sprint**: 1 (1-7 Mart 2026)

---

## 1. Admin Gorevleri (KRITIK)

> **Sen projenin tek admin'isin. Admin yetkisi sadece sende olacak.**

### 1.1 Kullanici Yonetimi
- Admin sayfasina giris yap
- Gereksiz/test kullanicilarini sil
- Her takim uyesi icin bireysel hesap olustur:
  - **Mehmet ISIK** — Product Owner rolu
  - **Gozde KIZILKAYA** — Scrum Master rolu
  - **Gamze GUNDOGDU** — standart kullanici
  - **Onur KARAGOZ** — standart kullanici
  - **Havva CECEN** — admin rolu
- Baska kimseye admin yetkisi verilmeyecek

### 1.2 Veritabani Altyapisi
- Supabase credentials'lari yonet (sadece sende)
- Cross-DB testleri icin takim uyelerine destek ver
- Veritabani erisim sorunlarini coz

---

## 2. SQL Sorgu Testi (100 Sorgu)

> **ONEMLI**: Senin sorgularin diger takim uyelerinden **tamamen farkli** olmali.
> Ayni veya benzer sorgular kabul edilmez. Farkli tablolar, farkli senaryolar sec.
> **TESTE BASLAMADAN ONCE** sorgu listeni Scrum Master'a (Gozde) onaylat. Onay almadan teste baslanmaz.

### 2.1 Tek Veritabani Sorgulari (50 adet)
- AskDB uzerinden 50 farkli dogal dil sorusu sor
- PostgreSQL (Supabase) uzerinde calistir
- Her sorgu icin kayit tut:
  - Sorulan soru (dogal dil)
  - Uretilen SQL
  - Sonuc dogrulugu (dogru/yanlis/kismen)
  - Hata varsa aciklama
  - Yanit suresi

### 2.2 Cross-DB Sorgulari (50 adet)
- Farkli veritabanlari arasi 50 sorgu test et
- Trino uzerinden cross-DB federation test et
- Ayni kayit formatini kullan

### 2.3 Cross-DB Destek Rolu
- **Diger takim uyeleri cross-DB testlerini seninle birlikte yapacak**
- Gozde, Onur ve Gamze'nin cross-DB testlerinde Supabase erisimi sagla
- Credential paylasimi guvenli sekilde yap
- Cross-DB baglanti sorunlarini coz

### 2.4 Capraz Kontrol
- Baska bir takim uyesinin SQL sonuclarini dogrula
- Supabase'den bizzat kontrol et (DB erisimi sende)
- Uyumsuzluklari raporla

---

## 3. Analysis ve ML Testi

### 3.1 Analysis Engine Testi
- SQL sorgularindan donen tablolari Analysis modulune gonder
- Farkli analiz turlerini dene (istatistik, korelasyon, trend vb.)
- Sonuclarin anlamliligini degerlendir
- Hatalari ve iyilestirme onerilerini raporla

### 3.2 ML Engine Testi
- SQL sorgularindan donen tablolari ML modulune gonder
- Farkli ML modellerini dene (regression, classification vb.)
- Model performansini degerlendir
- Hatalari ve iyilestirme onerilerini raporla

---

## 4. Modul Sahipligi: admin/ + sql/execution/

### 4.1 Modul Dokumantasyonu
Asagidaki modullerin `.md` dokumantasyonunu hazirla (`docs/moduller/` altinda):

| Dosya | Dokuman |
|-------|---------|
| `backend/admin/routes.py` | `docs/moduller/admin/routes.md` |
| `backend/admin/user_routes.py` | `docs/moduller/admin/user-routes.md` |

### 4.2 Dokumantasyon Formati (ZORUNLU STANDART)
Her dokumanda su bolumler olmali — **bu format tum takim icin gecerlidir, Scrum Master kontrol edecek**:
1. **Amac**: Modul ne yapar, neden var
2. **Bagimliliklari**: Hangi diger modulleri kullaniyor
3. **Fonksiyonlar / Class'lar**: Her birinin parametreleri, donus tipi, ne is yaptigi
4. **Ornek Kullanim**: Kod ornegi
5. **Degisiklik Gecmisi**: Tarih + aciklama tablosu

> Formata uymayan dokumanlar Scrum Master tarafindan reddedilir.

---

## 5. Log Analizi

- Uygulama loglarini incele (Railway uzerinden veya lokal)
- **Ozellikle veritabani baglanti loglarini ve sorgu performans loglarini incele**
- Hata paternlerini tespit et
- Yavas sorgulari ve baglanti sorunlarini raporla
- Log formatinin yeterliligi hakkinda geri bildirim ver

---

## 6. Bug / Hata Avciligi

- Uygulama uzerinde genel test yap
- **Ozellikle admin sayfasi ve veritabani islemlerinde derinlemesine test yap**
- Buldugu hatalari GitHub Issues'a kaydet
- Hata onceliklerini belirle (critical, high, medium, low)

---

## 7. UI / UX Onerileri

- Frontend arayuzunu kullanici gozuyle degerlendir
- **Admin sayfasi icin ozellikle detayli degerlendirme yap**:
  - Kullanici yonetim arayuzu yeterli mi?
  - Log goruntuleme yeterli mi?
  - Veritabani baglanti durumu anlasilir mi?
- Iyilestirme onerilerini GitHub Issues'a yaz
- Mobil uyumluluk kontrolu yap

---

## 8. Sorun Bildirimi

- Herhangi bir sorun/engel yasarsan **once Scrum Master'a (Gozde) bildir**
- Gozde cozemezse PO'ya (Mehmet) eskale edilecek
- GitHub Issues + Kanban board uzerinden takip et

---

## Teslimat Kontrol Listesi

- [ ] Admin sayfasi duzenlemesi yapildi (kullanicilar olusturuldu/silindi)
- [ ] 50 tek-DB SQL sorgusu test edildi
- [ ] 50 cross-DB SQL sorgusu test edildi
- [ ] Diger takim uyelerinin cross-DB testlerine destek verildi
- [ ] Capraz kontrol yapildi
- [ ] Analysis Engine test edildi
- [ ] ML Engine test edildi
- [ ] admin/ modul dokumantasyonu yazildi (2 dosya)
- [ ] Log analizi yapildi (ozellikle DB loglari)
- [ ] Bulunan hatalar Issues'a kaydedildi
- [ ] UI/UX onerileri yazildi (ozellikle admin sayfasi)
