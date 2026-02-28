# Sprint 1 — Onur KARAGOZ Gorevleri

**Rol**: Full-stack Developer
**GitHub**: @OnurKaragozZ
**Sprint**: 1 (1-4 Mart 2026)

---

## 1. SQL Sorgu Testi (100 Sorgu)

> **ONEMLI**: Senin sorgularin diger takim uyelerinden **tamamen farkli** olmali.
> Ayni veya benzer sorgular kabul edilmez. Farkli tablolar, farkli senaryolar sec.
> **TESTE BASLAMADAN ONCE** sorgu listeni Scrum Master'a (Gozde) onaylat. Onay almadan teste baslanmaz.

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

## 2. Analysis ve ML Testi

### 2.1 Analysis Engine Testi
- SQL sorgularindan donen tablolari Analysis modulune gonder
- Farkli analiz turlerini dene (istatistik, korelasyon, trend vb.)
- Sonuclarin anlamliligini degerlendir
- Hatalari ve iyilestirme onerilerini raporla

### 2.2 ML Engine Testi
- SQL sorgularindan donen tablolari ML modulune gonder
- Farkli ML modellerini dene (regression, classification vb.)
- Model performansini degerlendir
- Hatalari ve iyilestirme onerilerini raporla

---

## 3. Modul Sahipligi: sql/ + reports/

### 3.1 Modul Dokumantasyonu
Asagidaki modullerin `.md` dokumantasyonunu hazirla (`docs/moduller/` altinda):

| Dosya | Dokuman |
|-------|---------|
| `backend/sql/routes.py` | `docs/moduller/sql/routes.md` |
| `backend/sql/execution/database.py` | `docs/moduller/sql/database.md` |
| `backend/sql/execution/adapters.py` | `docs/moduller/sql/adapters.md` |
| `backend/sql/execution/security.py` | `docs/moduller/sql/security.md` |
| `backend/sql/execution/migrations.py` | `docs/moduller/sql/migrations.md` |
| `backend/sql/llm/service.py` | `docs/moduller/sql/llm-service.md` |
| `backend/sql/llm/providers.py` | `docs/moduller/sql/llm-providers.md` |
| `backend/sql/cache/service.py` | `docs/moduller/sql/cache.md` |
| `backend/sql/rate_limit.py` | `docs/moduller/sql/rate-limit.md` |
| `backend/sql/schema/routes.py` | `docs/moduller/sql/schema.md` |
| `backend/sql/websocket/progress.py` | `docs/moduller/sql/websocket.md` |
| `backend/reports/routes.py` | `docs/moduller/reports/routes.md` |

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
- Hata paternlerini tespit et
- Performans sorunlarini raporla
- Log formatinin yeterliligi hakkinda geri bildirim ver

---

## 5. Bug / Hata Avciligi

- Uygulama uzerinde genel test yap (tum sayfalar, tum ozellikler)
- Full-stack perspektifinden hem frontend hem backend hatalari ara
- Buldugu hatalari GitHub Issues'a kaydet
- Hata onceliklerini belirle (critical, high, medium, low)

---

## 6. UI / UX Onerileri

- Frontend arayuzunu kullanici gozuyle degerlendir
- Kullanilabilirlik sorunlarini raporla
- Iyilestirme onerilerini GitHub Issues'a yaz
- Mobil uyumluluk kontrolu yap
- Full-stack developer olarak teknik uygulanabilirlik degerlendirmesi yap

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
- [ ] Analysis Engine test edildi
- [ ] ML Engine test edildi
- [ ] sql/ modul dokumantasyonu yazildi (11 dosya)
- [ ] reports/ modul dokumantasyonu yazildi (1 dosya)
- [ ] Log analizi yapildi
- [ ] Bulunan hatalar Issues'a kaydedildi
- [ ] UI/UX onerileri yazildi
