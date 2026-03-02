# AskDB — Proje Kurallari

---

## !! MASTER VE DEVELOP BRANCH'LERE DIREKT PUSH YAPILMAZ !!

## !! BU KURALA UYMAYAN COMMIT REVERT EDILIR !!

---

## Branch Yapisi

```
master    ← Canli ortam (production). Sadece PO merge eder.
develop   ← Gelistirme ortami. PR'lar buraya merge edilir.
feature/* ← Takim uyelerinin calistigi branch'ler.
```

- **master**: Canli ortamdaki kod. Kimse direkt push yapamaz. Sprint sonunda PO develop → master merge yapar ve deploy tetikler.
- **develop**: Gelistirme branch'i. Tum PR'lar develop'a acilir. PO review + onay sonrasi merge edilir.
- **feature/xxx**: Her gorev icin acilan branch. develop'dan aciilir, develop'a merge edilir.

## Git Is Akisi

1. **develop'dan branch ac**: `git checkout develop && git pull origin develop && git checkout -b feature/gorev-adi`
2. **Kodunu/dokumanini yaz**, commit et, push et
3. **GitHub'da PR (Pull Request) ac** → **develop** branch'ine dogru! (master'a degil!)
4. Testlerin gecmesini bekle (CI otomatik calisir)
5. **Product Owner (Mehmet)** PR'i review eder, onaylar veya yorum yazar
6. **Product Owner (Mehmet)** onay verdikten sonra **merge butonuna basar**
7. Sprint sonunda PO **develop → master** merge yapar ve deploy tetikler

> **ONEMLI**: PR'larinizi **develop** branch'ine acin. Master'a PR acan kisinin PR'i reddedilir.

## Dokumantasyon Kurallari (KRITIK)

> **DOKUMANTASYON PROJENIN EN ONEMLI CIKTILARINDAN BIRIDIR.**
> Eksik veya standart disi dokumantasyon kabul edilmez.
> PR'da dokumantasyon yoksa veya formata uymuyorsa PR reddedilir.

- Calistigin her `.py` dosyasi icin `docs/moduller/` altinda `.md` dokumani hazirla
- **ZORUNLU FORMAT** — Her dokumanda su 5 bolum olmali:
  1. **Amac**: Modul ne yapar, neden var
  2. **Bagimliliklari**: Hangi diger modulleri kullaniyor
  3. **Fonksiyonlar / Class'lar**: Parametreleri, donus tipi, ne is yaptigi
  4. **Ornek Kullanim**: Kod ornegi
  5. **Degisiklik Gecmisi**: Tarih + aciklama tablosu
- Scrum Master (Gozde) tum dokumanlarin formatini ve kalitesini kontrol eder
- Formata uymayan dokumanlar reddedilir ve yeniden yazdirilir
- Dokumani PR ile gonder — once Scrum Master, sonra PO onaylar
- Turkce yaz, teknik terimleri Ingilizce birakabilirsin

## SQL Sorgu Testi Kurallari

> **HER TAKIM UYESININ SORGULARI BIRBIRINDEN FARKLI OLMAK ZORUNDADIR.**
> Ayni veya benzer sorgular kabul edilmez.

- Her kisi **kendine ozgu** 100 sorgu hazirlar (50 tek-DB + 50 cross-DB)
- Sorgular birbirini tekrar etmemeli — farkli tablolar, farkli sorular, farkli senaryolar
- **TEST BASLAMADAN ONCE** hazirladigi sorgu listesini **Product Owner'a (Mehmet) onaylat**
- PO onaylamadan teste baslanmaz
- PO sorgu listelerini karsilastirip tekrar olmadigini kontrol eder
- Onaylanan sorgu listesi degistirilemez (ek sorgular eklenebilir)

## Test Sonuclari ve Rapor Dokumantasyonu

> **ONEMLI**: Modul dokumantasyonu ile test raporu **farkli seylerdir**.
> - **Modul dokumani** = Kod ne yapar (teknik referans, `docs/moduller/` altina)
> - **Test raporu** = Ne bulduk, ne calisiyor, ne calismiyor (bulgular, `docs/raporlar/` altina)

Test sonuclarini raporlamak icin `docs/sablonlar/` altindaki sablonlari kullanin:

| Sablon | Ne Icin |
|--------|---------|
| `sql-test-sonuclari-sablon.md` | 100 SQL sorgu test sonuclari |
| `bug-raporu-sablon.md` | Bulunan hatalar |
| `test-raporu-sablon.md` | Analysis/ML testi, log analizi, UI/UX onerileri |

**Kullanim**: Sablonu kopyalayin, kendi adinizla doldurun, PR ile gonderin.
Sablonlarda ufak tefek degisiklikler yapabilirsiniz, ancak temel yapi ve tablo formatini koruyun.

**Dosya isimlendirme**: `docs/raporlar/isim-soyisim-rapor-turu.md`
- Ornek: `docs/raporlar/onur-karagoz-sql-test-sonuclari.md`
- Ornek: `docs/raporlar/gamze-gundogdu-bug-raporu.md`
- Ornek: `docs/raporlar/havva-cecen-test-raporu.md`

## Commit Mesaji Kurallari

- Kisa ve aciklayici yaz (Ingilizce veya Turkce)
- Ornekler:
  - `Add user authentication tests`
  - `Fix cache TTL calculation bug`
  - `Update ML engine documentation`

## Sprint Bilgileri

- **Sprint suresi**: 7 gun
- **Sprint 1**: 1 Mart - 7 Mart 2026 (Pazar - Cumartesi)
- **Sprint 1 baslangic**: 1 Mart 2026, 09:00
- **Daily standup**: Her gun saat 09:00 (Scrum Master koordine eder)
- **Sprint review**: 7 Mart 2026 Cumartesi (son gun)

## Takim Yapisi

| Kisi | Rol | GitHub |
|------|-----|--------|
| **Mehmet ISIK** | Product Owner + AI Team Lead | @mmehmetisik |
| **Gozde KIZILKAYA** | Scrum Master + Data Scientist | @gkizilkaya |
| **Havva CECEN** | Data Engineer | @havvacecen |
| **Gamze GUNDOGDU** | AI/ML/Analysis Developer | @gamzegndgd |
| **Onur KARAGOZ** | Full-stack Developer | @OnurKaragozZ |

## Canli Ortam

- **Uygulama**: https://askdb-web-production.up.railway.app
- **Health Check**: https://askdb-web-production.up.railway.app/api/health
- **Platform**: Railway

## Deploy Kurallari

> **DEPLOY SADECE PRODUCT OWNER (MEHMET) TARAFINDAN TETIKLENIR.**
> **HICBIR TAKIM UYESI DEPLOY YAPMAZ, YAPAMAZ.**

- Deploy, GitHub Actions uzerinden **manuel** tetiklenir (workflow_dispatch)
- PO (Mehmet) PR'lari review edip onayladiktan sonra deploy tetikler
- Akis: **PR onay (PO) → Merge → Deploy (PO tetikler)**
- Sorun/acil durum varsa once Scrum Master'a bildir, SM PO'ya eskale eder

## Iletisim

- **Kod tartismasi**: GitHub PR yorumlari
- **Genel iletisim**: Takim kanali (WhatsApp)
- **Kanban board**: https://github.com/users/mmehmetisik/projects/5
