# AskDB — Proje Kurallari

---

## !! MASTER BRANCH'E DIREKT PUSH YAPILMAZ !!

## !! BU KURALA UYMAYAN COMMIT REVERT EDILIR !!

---

## Git Is Akisi

1. **Kendi branch'ini ac**: `git checkout -b feature/gorev-adi`
2. **Kodunu yaz**, commit et, push et
3. **GitHub'da PR (Pull Request) ac** → testlerin gecmesini bekle
4. **Scrum Master (Gozde)** PR'i review eder, onaylar veya yorum yazar
5. **Product Owner (Mehmet)** final onay verir
6. **Merge** edilir → master'a girer
7. **Deploy** → Sadece PO (Mehmet) tetikler (asagidaki Deploy Kurallari'na bak)

## Dokumantasyon Kurallari

- Calistigin her `.py` dosyasi icin `docs/moduller/` altinda `.md` dokumani hazirla
- Dokumani PR ile gonder — once Scrum Master, sonra PO onaylar
- Degisiklik Gecmisi bolumunu her guncellediginde doldur
- Turkce yaz, teknik terimleri Ingilizce birakabilirsin

## Commit Mesaji Kurallari

- Kisa ve aciklayici yaz (Ingilizce veya Turkce)
- Ornekler:
  - `Add user authentication tests`
  - `Fix cache TTL calculation bug`
  - `Update ML engine documentation`

## Sprint Bilgileri

- **Sprint suresi**: 1 hafta (Pazar - Cumartesi)
- **Sprint 1 baslangic**: 1 Mart 2026, 09:00
- **Daily standup**: Her gun saat 09:00 (Scrum Master koordine eder)
- **Sprint review**: Her Cumartesi

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
- Scrum Master (Gozde) PR'lari review edip onaylamadan deploy olmaz
- PO (Mehmet) final onay verdikten sonra deploy tetikler
- Akis: **PR onay (SM) → Final onay (PO) → Merge → Deploy (PO tetikler)**
- Sorun/acil durum varsa once Scrum Master'a bildir, SM PO'ya eskale eder

## Iletisim

- **Kod tartismasi**: GitHub PR yorumlari
- **Genel iletisim**: Takim kanali (WhatsApp)
- **Kanban board**: https://github.com/users/mmehmetisik/projects/5
