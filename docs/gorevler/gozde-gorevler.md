# Sprint 1 — Gozde KIZILKAYA Gorevleri

**Rol**: Scrum Master + Data Scientist
**GitHub**: @gkizilkaya
**Sprint**: 1 (1-7 Mart 2026)

---

## 1. Scrum Master Gorevleri

### 1.1 Sprint Yonetimi
- Daily standup'lari koordine et (her gun 09:00)
- Kanban board'u guncelle: https://github.com/users/mmehmetisik/projects/5
- Sprint 1 sonunda sprint review toplantisi duzenlenir (Cumartesi)
- Sprint report hazirla (neler yapildi, neler kaldi, engeller)

### 1.2 PR Review
- Tum takim uyelerinin PR'larini ilk sen review et
- PR'lar **develop** branch'ine acilmali — master'a acan PR'lari reddet
- Review sonrasi PO (Mehmet) onayina yonlendir
- PR'larda kod kalitesi, commit mesaji ve dokumantasyon kontrolu yap

### 1.3 SQL Sorgu Listesi Onayi (KRITIK)
- **Takim uyeleri teste baslamadan once** sorgu listelerini sana gonderecek
- Sorgu listelerini incele ve karsilastir:
  - Her kisinin sorgulari birbirinden **farkli** olmali
  - Ayni veya benzer sorgular varsa reddedip yeniden yazdir
  - Farkli tablolar, farkli senaryolar, farkli zorluk seviyeleri olmali
- **Sen onaylamadan kimse teste baslamaz**
- Onaylanan sorgu listesi degistirilemez

### 1.4 Iletisim
- Takim uyelerinin ilk basvuru noktasi sensin
- Sorun/engel varsa once sana bildirilecek
- Gerekirse PO'ya eskale et

---

## 2. SQL Sorgu Testi (100 Sorgu)

> **ONEMLI**: Senin sorgularin diger takim uyelerinden **tamamen farkli** olmali.
> Ayni veya benzer sorgular kabul edilmez. Farkli tablolar, farkli senaryolar sec.
> Sorgu listeni hazirladiktan sonra — sen SM olarak kendi listeni PO'ya (Mehmet) onaylat.

### 2.1 Tek Veritabani Sorgulari (50 adet)
- AskDB uzerinden 50 farkli dogal dil sorusu sor
- PostgreSQL (Supabase) uzerinde calistir
- Her sorgu icin kayit tut:
  - Sorulan soru (dogal dil)
  - Uretilen SQL
  - Sonuc dogrulugu (dogru/yanlis/kismen)
  - Hata varsa aciklama
  - Yanit suresi

### 2.2 Cross-DB Sorgulari (50 adet) — Havva ile birlikte
- **ONEMLI**: Cross-DB testleri Havva ile birlikte yap (Supabase credentials Havva'da)
- Farkli veritabanlari arasi 50 sorgu test et
- Trino uzerinden cross-DB federation test et
- Ayni kayit formatini kullan

### 2.3 Capraz Kontrol
- Baska bir takim uyesinin SQL sonuclarini dogrula
- Supabase'den bizzat kontrol et (Havva ile birlikte)
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

## 4. Modul Sahipligi: core/ + auth/

### 4.1 Modul Dokumantasyonu
Asagidaki modullerin `.md` dokumantasyonunu hazirla (`docs/moduller/` altinda):

| Dosya | Dokuman |
|-------|---------|
| `backend/core/config.py` | `docs/moduller/core/config.md` |
| `backend/core/middleware.py` | `docs/moduller/core/middleware.md` |
| `backend/core/csrf.py` | `docs/moduller/core/csrf.md` |
| `backend/core/i18n.py` | `docs/moduller/core/i18n.md` |
| `backend/core/logging_config.py` | `docs/moduller/core/logging_config.md` |
| `backend/core/models.py` | `docs/moduller/core/models.md` |
| `backend/auth/service.py` | `docs/moduller/auth/service.md` |
| `backend/auth/routes.py` | `docs/moduller/auth/routes.md` |

### 4.2 Dokumantasyon Formati
Her dokumanda su bolumler olmali:
- Amac (modul ne yapar)
- Bagimliliklari
- Fonksiyonlar / Class'lar (parametre + donus tipi)
- Ornek kullanim
- Degisiklik Gecmisi

---

## 5. Proje Dokumantasyonu Sorumlulugu (KRITIK)

> **BU GOREV EN ONEMLI GOREVLERDEN BIRIDIR.**
> Dokumantasyon projenin uzun vadeli basarisi icin hayati onem tasir.
> Her moduldokumani ayni standartta, ayni formatta, ayni kalitede olmali.

- **Tum projenin dokumante edilmesinden sorumlusun**
- Diger takim uyelerinin yazdigi moduldokumantasyonlarini review et
- **STANDART FORMAT ZORUNLULUGU**: Asagidaki format tum takim uyeleri icin gecerlidir. Formata uymayan dokumanlar reddedilir ve yeniden yazdirilir:
  1. **Amac**: Modul ne yapar, neden var
  2. **Bagimliliklari**: Hangi diger modulleri kullaniyor
  3. **Fonksiyonlar / Class'lar**: Her birinin parametreleri, donus tipi, ne is yaptigi
  4. **Ornek Kullanim**: Kod ornegi
  5. **Degisiklik Gecmisi**: Tarih + aciklama tablosu
- Tutarlilik ve kalite kontrolu yap — isimlendirme, dil, detay seviyesi hep ayni olmali
- Eksik veya standart disi dokumantasyonlari takip et ve takim uyelerini uyar
- PR'da dokumanlar eksikse PR'i onaylama, duzeltme iste

---

## 6. Log Analizi

- Uygulama loglarini incele (Railway uzerinden veya lokal)
- Hata paternlerini tespit et
- Performans sorunlarini raporla
- Log formatinin yeterliligi hakkinda geri bildirim ver

---

## 7. Bug / Hata Avciligi

- Uygulama uzerinde genel test yap
- Buldugu hatalari GitHub Issues'a kaydet
- Hata onceliklerini belirle (critical, high, medium, low)
- Kanban board'a ekle

---

## 8. UI / UX Onerileri

- Frontend arayuzunu kullanici gozuyle degerlendir
- Kullanilabilirlik sorunlarini raporla
- Iyilestirme onerilerini GitHub Issues'a yaz
- Mobil uyumluluk kontrolu yap

---

## 9. Admin Sayfa Gorevleri

- Kendi kullanici hesabini olustur (Scrum Master rolunde)
- Gereksiz/test kullanicilarinin silinmesini PO'ya bildir
- **Admin yetkisi sadece Havva'da olacak** — diger kullanicilar standart rol alacak

---

## Teslimat Kontrol Listesi

- [ ] 50 tek-DB SQL sorgusu test edildi
- [ ] 50 cross-DB SQL sorgusu test edildi (Havva ile)
- [ ] Capraz kontrol yapildi
- [ ] Analysis Engine test edildi
- [ ] ML Engine test edildi
- [ ] core/ moduldokumantasyonu yazildi (6 dosya)
- [ ] auth/ moduldokumantasyonu yazildi (2 dosya)
- [ ] Diger takim uyelerinin dokumantasyonlari review edildi
- [ ] Log analizi yapildi
- [ ] Bulunan hatalar Issues'a kaydedildi
- [ ] UI/UX onerileri yazildi
- [ ] Sprint report hazir
- [ ] Kanban board guncel
