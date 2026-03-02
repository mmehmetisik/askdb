# Sprint 1 — Gamze GUNDOGDU Gorevleri

**Rol**: AI/ML/Analysis Developer
**GitHub**: @gamzegndgd
**Sprint**: 1 (1-4 Mart 2026)

---

## 1. SQL Sorgu Testi (100 Sorgu)

> **ONEMLI**: Senin sorgularin diger takim uyelerinden **tamamen farkli** olmali.
> Ayni veya benzer sorgular kabul edilmez. Farkli tablolar, farkli senaryolar sec.
> **TESTE BASLAMADAN ONCE** sorgu listeni Product Owner'a (Mehmet) onaylat. Onay almadan teste baslanmaz.

### 1.1 Tek Veritabani Sorgulari (50 adet)
- AskDB uzerinden 50 farkli dogal dil sorusu sor
- PostgreSQL (Supabase) uzerinde calistir
- Her sorgu icin kayit tut:
  - Sorulan soru (dogal dil)
  - Uretilen SQL
  - Sonuc dogrulugu (dogru/yanlis/kismen)
  - Hata varsa aciklama
  - Yanit suresi

### 1.2 Cross-DB Sorgulari (50 adet) — Havva ile birlikte
- **ONEMLI**: Cross-DB testleri Havva ile birlikte yap (Supabase credentials Havva'da)
- Farkli veritabanlari arasi 50 sorgu test et
- Trino uzerinden cross-DB federation test et
- Ayni kayit formatini kullan

### 1.3 Capraz Kontrol
- Baska bir takim uyesinin SQL sonuclarini dogrula
- Supabase'den bizzat kontrol et (Havva ile birlikte)
- Uyumsuzluklari raporla

---

## 2. Analysis ve ML Testi (ODAK ALAN)

> **AI/ML/Analysis Developer olarak bu alan senin ana sorumlulugundur.**
> Diger takim uyeleri de test edecek ama sen en derinlemesine test yapacaksin.

### 2.1 Analysis Engine Testi (Detayli)
- SQL sorgularindan donen tablolari Analysis modulune gonder
- **Tum analiz turlerini** sistematik olarak test et:
  - Istatistiksel analiz (ortalama, medyan, standart sapma vb.)
  - Korelasyon analizi
  - Trend analizi
  - Dagilim analizi
  - Gruplama / segmentasyon
- Her analiz turu icin en az 5 farkli tablo ile test et
- Sonuclarin matematiksel dogrulugunudeğerlendir
- Edge case'leri test et (bos tablo, tek satir, NULL degerler vb.)
- Hatalari ve iyilestirme onerilerini detayli raporla

### 2.2 ML Engine Testi (Detayli)
- SQL sorgularindan donen tablolari ML modulune gonder
- **Tum ML modellerini** sistematik olarak test et:
  - Linear Regression
  - Logistic Regression (Classification)
  - Decision Tree
  - Random Forest
  - Clustering (K-Means vb.)
- Her model icin en az 3 farkli dataset ile test et
- Model performans metriklerini degerlendir (R2, accuracy, F1 vb.)
- Edge case'leri test et (az veri, cok fazla feature, dengesiz siniflar vb.)
- Hatalari ve iyilestirme onerilerini detayli raporla

---

## 3. Modul Sahipligi: analysis/ + ml/

### 3.1 Modul Dokumantasyonu
Asagidaki modullerin `.md` dokumantasyonunu hazirla (`docs/moduller/` altinda):

| Dosya | Dokuman |
|-------|---------|
| `backend/analysis/engine.py` | `docs/moduller/analysis/engine.md` |
| `backend/analysis/routes.py` | `docs/moduller/analysis/routes.md` |
| `backend/ml/engine.py` | `docs/moduller/ml/engine.md` |
| `backend/ml/routes.py` | `docs/moduller/ml/routes.md` |

### 3.2 Dokumantasyon Formati (ZORUNLU STANDART)
Her dokumanda su bolumler olmali — **bu format tum takim icin gecerlidir, Scrum Master kontrol edecek**:
1. **Amac**: Modul ne yapar, neden var
2. **Bagimliliklari**: Hangi diger modulleri kullaniyor
3. **Fonksiyonlar / Class'lar**: Her birinin parametreleri, donus tipi, ne is yaptigi
4. **Ornek Kullanim**: Kod ornegi
5. **Degisiklik Gecmisi**: Tarih + aciklama tablosu

> Formata uymayan dokumanlar Scrum Master tarafindan reddedilir.

---

## 4. Log Analizi

- Uygulama loglarini incele (Railway uzerinden veya lokal)
- Ozellikle analysis ve ML endpoint'lerinin loglarini detayli incele
- Hata paternlerini tespit et
- Performans sorunlarini raporla (model egitim suresi, analiz suresi vb.)
- Log formatinin yeterliligi hakkinda geri bildirim ver

---

## 5. Bug / Hata Avciligi

- Uygulama uzerinde genel test yap
- **Ozellikle analysis ve ML sayfalarinda derinlemesine test yap**
- Buldugu hatalari GitHub Issues'a kaydet
- Hata onceliklerini belirle (critical, high, medium, low)

---

## 6. UI / UX Onerileri

- Frontend arayuzunu kullanici gozuyle degerlendir
- **Analysis ve ML sayfalari icin ozellikle detayli degerlendirme yap**:
  - Grafik/tablo goruntuleme yeterli mi?
  - Model sonuclari anlasilir sekilde sunuluyor mu?
  - Parametre secimi kullanici dostu mu?
- Iyilestirme onerilerini GitHub Issues'a yaz
- Mobil uyumluluk kontrolu yap

---

## 7. Admin Sayfa Gorevleri

- Kendi kullanici hesabini olustur (standart kullanici rolunde)
- Gereksiz/test kullanicilarini Havva'ya (admin) bildirerek sildir
- **Admin yetkisi sadece Havva'da** — baska kimse admin olmayacak

---

## 8. Sorun Bildirimi

- Herhangi bir sorun/engel yasarsan **once Scrum Master'a (Gozde) bildir**
- Gozde cozemezse PO'ya (Mehmet) eskale edilecek
- GitHub Issues + Kanban board uzerinden takip et

---

## Teslimat Kontrol Listesi

- [ ] 50 tek-DB SQL sorgusu test edildi
- [ ] 50 cross-DB SQL sorgusu test edildi (Havva ile)
- [ ] Capraz kontrol yapildi
- [ ] Analysis Engine detayli test edildi (tum analiz turleri)
- [ ] ML Engine detayli test edildi (tum model turleri)
- [ ] analysis/ modul dokumantasyonu yazildi (2 dosya)
- [ ] ml/ modul dokumantasyonu yazildi (2 dosya)
- [ ] Log analizi yapildi (ozellikle analysis/ML loglari)
- [ ] Bulunan hatalar Issues'a kaydedildi
- [ ] UI/UX onerileri yazildi (ozellikle analysis/ML sayfalari)
