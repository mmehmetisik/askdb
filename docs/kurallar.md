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
6. **Merge** edilir → master'a girer → Railway otomatik deploy eder

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

## Iletisim

- **Kod tartismasi**: GitHub PR yorumlari
- **Genel iletisim**: Takim kanali (belirlenecek)
- **Kanban board**: https://github.com/users/mmehmetisik/projects/5
