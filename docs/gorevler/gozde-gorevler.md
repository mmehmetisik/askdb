# Sprint 1 — Gozde KIZILKAYA Gorevleri

**Rol**: Scrum Master + Data Scientist
**GitHub**: @gkizilkaya
**Sprint**: 1 (1-7 Mart 2026)

---

## 1. Scrum Master Koordinasyonu

### 1.1 Sprint Yonetimi
- Daily standup'lari koordine et (her gun 09:00)
- Kanban board'u guncelle: https://github.com/users/mmehmetisik/projects/5
- Sprint 1 sonunda sprint review toplantisi duzenlenir (Cumartesi)
- Takim uyelerinin ilk basvuru noktasi sensin
- Sorun/engel varsa once sana bildirilecek, gerekirse PO'ya eskale et

### 1.2 Sprint Raporu
- Sprint sonunda rapor hazirla:
  - Neler yapildi
  - Neler kaldi
  - Engeller ve cozumler
  - Takim performans ozeti
- Raporu PO'ya (Mehmet) sun

---

## 2. Modul Dokumantasyonu: core/ + auth/

> **BU GOREV SPRINT 1'IN EN ONEMLI CIKTILARINDAN BIRIDIR.**
> Diger takim uyeleri senin dokumanlarini referans alacak.
> Kalite ve detay seviyesi yuksek olmali.

### 2.1 Dokumantasyon Yazimi
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

### 2.2 Dokumantasyon Formati
Her dokumanda su bolumler olmali:
1. **Amac**: Modul ne yapar, neden var
2. **Bagimliliklari**: Hangi diger modulleri kullaniyor
3. **Fonksiyonlar / Class'lar**: Parametreleri, donus tipi, ne is yaptigi
4. **Ornek Kullanim**: Kod ornegi
5. **Degisiklik Gecmisi**: Tarih + aciklama tablosu

---

## 3. Dokumantasyon Kalite Kontrolu

> Tum projenin dokumantasyon kalitesinden sorumlusun.
> Bu gorev proje basarisi icin kritik oneme sahiptir.

- Diger takim uyelerinin (Gamze, Onur, Havva) yazdigi moduldokumantasyonlarini review et
- **STANDART FORMAT ZORUNLULUGU**: Yukaridaki 5 bolum formatina uymayanlar reddedilir
- Tutarlilik ve kalite kontrolu yap — isimlendirme, dil, detay seviyesi hep ayni olmali
- Eksik veya standart disi dokumantasyonlari takip et ve takim uyelerini uyar
- Formata uymayan dokumanlar icin duzeltme iste

---

## Teslimat Kontrol Listesi

- [ ] core/ moduldokumantasyonu yazildi (6 dosya)
- [ ] auth/ moduldokumantasyonu yazildi (2 dosya)
- [ ] Diger takim uyelerinin dokumantasyonlari review edildi
- [ ] Sprint raporu hazir
- [ ] Kanban board guncel
