# Sprint 2 -- Plan ve Gorev Dagitimi

**Sprint**: 2
**Tarih**: 10 Mart - 30 Mart 2026
**Takim**: Gozde KIZILKAYA (SM), Gamze GUNDOGDU, Onur KARAGOZ, Havva CECEN
**Product Owner**: Mehmet ISIK
**Bayram Tatili**: 19-20-21 Mart 2026 (Ramazan Bayrami)

---

## Sprint Hedefleri

1. **Arastirma ve Sunum**: Veritabani, SQL, Backend/API ve LLM temel kavramlarini ogrenmek
2. **SQL Sorgu Testi Devami**: Sprint 1den kalan cross-DB testlerini tamamlamak
3. **Kod Iyilestirme / Bug Fix**: Ekipce bug bulma ve birlikte duzeltme

---

## Takvim

| Tarih | Gun | Icerik |
|-------|-----|--------|
| 10 Mart | Salı | Arastirma/sunum hazirligi |
| 11 Mart | Çarşamba | Arastirma/sunum hazirligi |
| 12 Mart | Perşembe | Arastirma/sunum hazirligi |
| 13 Mart | Cuma | **Sunum gunu (istisna)** |

| 16 Mart | Pazartesi | SQL testlerine devam |
| 17 Mart | Sali | SQL testlerine devam |
| 18 Mart | Carsamba | SQL testlerine devam |
| **19-21 Mart** | **Per-Cum-Cmt** | **BAYRAM TATILI** |
| 23 Mart | Pazartesi | Bug avi (bireysel) |
| 24 Mart | Sali | Bug avi (bireysel) |
| 25 Mart | Carsamba | Bug duzeltme toplantisi #1 |
| 26 Mart | Persembe | Bug duzeltme toplantisi #2 |
| 26 Mart | Perşembe | Bug duzeltme toplantisi #3 |
| 26 Mart | Perşembe | "Neler yaptık, neler öğrendik, Sofkar'da hangi alanda yer almak istiyoruz?" sunumu |
| **30 Mart** | **Pazartesi** | **Sprint Review + Retrospective** |

> **Not**: Hafta sonlari sprintten sayilmaz. 

---

## Hafta 1 (10-13 Mart): Arastirma ve Sunum Hazirligi

### Veritabani Sunum Dagitimi

| Kisi | Veritabani | Icerik |
|------|-----------|--------|
| **Gamze GUNDOGDU** | MongoDB | NoSQL nedir, MongoDB ozellikleri, kullanim alanlari, ornek sorgular |
| **Onur KARAGOZ** | MS SQL | MS SQL ozellikleri, nerelerde kullanilir, ornek sorgular |
| **Havva CECEN** | PostgreSQL | PostgreSQL ozellikleri, avantajlari, ornek sorgular |

### Diger Sunum Konulari

| Kisi | Konu | Icerik |
|------|------|--------|
| **Onur KARAGOZ** | Backend/API Temelleri | API key, endpoint, single responsibility, HTTP GET/POST, pratik demo |
| **Gamze GUNDOGDU** | LLM Kavramlari | LLM nedir, prompt, parameters, temperature, body, ornek kullanim |
| **Gozde KIZILKAYA** | SQL Dialect Karsilastirmasi | MS SQL vs PostgreSQL vs MongoDB syntax farklari |

### Ortak Konular (Herkes Hazirlanacak)

- SQL nedir, temelleri neler
- Window function kavrami -- ne ise yarar, nasil kullanilir
- Pratik: SQL sorgulari yazip calistirma

### 13 Mart Cuma -- Sunum Gunu

Tum ekip bir araya gelir. Sunum sirasi:
1. Gamze - MongoDB
2. Onur - MS SQL
3. Havva - PostgreSQL
4. Gozde - SQL Dialect Karsilastirmasi
5. Onur - Backend/API Temelleri
6. Gamze - LLM Kavramlari
7. Ortak tartisma: Window functions, SQL pratik

---

## Hafta 2 (16-18 Mart): SQL Testlerine Devam

| Kisi | Gorev | Detay |
|------|-------|-------|
| **Gamze** | Cross-DB testleri (30 adet) | Havva ile birlikte, Trino uzerinden |
| **Onur** | Cross-DB testleri (30 adet) | Havva ile birlikte, Trino uzerinden |
| **Havva** | Cross-DB destek + kendi testleri | Supabase erisimi saglama |
| **Gozde** | SM koordinasyonu | Test surecini takip |


---

## Hafta 3 (23-27 Mart): Bug Avi ve Kod Iyilestirme

### Asama 1: Bug Avi -- Bireysel (23-24 Mart)

- Uygulamayi farkli senaryolarla test et
- Kodu incele, potansiyel sorunlari tespit et
- Buldugu her bugi localinde not olarak kaydet (GitHub Issue acilmayacak)
- Hedef: Her kisi minimum 3-5 bug bulsun

### Asama 2: Bug Duzeltme Toplantilari -- Ekipce (25-26-27 Mart)

**Konsept**: Herkes bir araya gelir. Birlikte tartisirlar, birlikte cozerler. Herkes her bugdan ogrensin.

| Gun | Tarih | Bug Sahibi | PR Hesabi |
|-----|-------|-----------|-----------|
| Toplanti #1 | 25 Mart (Car) | **Havva CECEN** | Havva GitHub hesabi |
| Toplanti #2 | 26 Mart (Per) | **Gamze GUNDOGDU** | Gamze GitHub hesabi |
| Toplanti #3 | 26 Mart (Per) | **Onur KARAGOZ** | Onur GitHub hesabi |

### Toplanti Sureci

1. O gunun sahibi ekranini paylarir
2. Buglarini sirayla gosterir
3. Ekipce tartisilir: Bu nasil duzeltilir?
4. Birlikte kod degisikligi yapilir
5. Bug sahibinin hesabindan branch acilir: fix/bug-aciklamasi
6. Commit atilir -- mesajina ne vardi, nasil duzeltildi yazilir
7. PR acilir -- develop branchine
8. PO (Mehmet) review eder, onaylarsa merge

### PR ve Branch Kurallari

- main ve develop branchlere direkt commit atilmaz
- Her bug fix icin ayri branch: fix/bug-kisa-aciklama
- PO (Mehmet) review + onay -- merge
- Gozde de ogrenme amaciyla PRlari inceleyebilir

### Rollback Plani

1. PR merge sonrasi sorun cikarsa: git revert ile geri alinir
2. git reset gibi tehlikeli komutlar kullanilmaz
3. Her PR oncesi lokalde test edilir
4. Deploy sadece PO tarafindan tetiklenir

---

## 30 Mart -- Sprint Review + Retrospective

- Tum takim bir araya gelir
- Sprint 2 boyunca yapilanlarin ozeti
- Sprint 3 icin on planlama

---

## Kisi Bazinda Gorev Ozeti

### Gozde KIZILKAYA (Scrum Master)
| # | Gorev | Hafta |
|---|-------|-------|
| 1 | SM koordinasyonu | Tum sprint |
| 2 | SQL Dialect Karsilastirmasi sunumu | Hafta 1 |
| 3 | 14 Mart sunum gunu koordinasyonu | Hafta 1 |
| 4 | SQL testleri surecini takip | Hafta 2 |
| 5 | Bug duzeltme toplantilarina katil | Hafta 3 |
| 6 | Sprint Review + Retrospective | 30 Mart |

### Gamze GUNDOGDU (AI/ML Developer)
| # | Gorev | Hafta |
|---|-------|-------|
| 1 | MongoDB sunumu | Hafta 1 |
| 2 | LLM Kavramlari sunumu | Hafta 1 |
| 3 | Cross-DB SQL testleri (30 adet, Havva ile) | Hafta 2 |
| 4 | Analysis/ML test (dusuk oncelik) | Hafta 2 |
| 5 | Bug avi (min 3-5 bug) | Hafta 3 (23-24 Mart) |
| 6 | Bug duzeltme toplantisi #2 | Hafta 3 (26 Mart) |

### Onur KARAGOZ (Full-stack Developer)
| # | Gorev | Hafta |
|---|-------|-------|
| 1 | MS SQL sunumu | Hafta 1 |
| 2 | Backend/API Temelleri sunumu | Hafta 1 |
| 3 | Cross-DB SQL testleri (30 adet, Havva ile) | Hafta 2 |
| 4 | Bug avi (min 3-5 bug) | Hafta 3 (23-24 Mart) |
| 5 | Bug duzeltme toplantisi #3 | Hafta 3 (27 Mart) |

### Havva CECEN (Data Engineer + Admin)
| # | Gorev | Hafta |
|---|-------|-------|
| 1 | PostgreSQL sunumu | Hafta 1 |
| 2 | Cross-DB destek + kendi testleri | Hafta 2 |
| 3 | Bug avi (min 3-5 bug) | Hafta 3 (23-24 Mart) |
| 4 | Bug duzeltme toplantisi #1 | Hafta 3 (25 Mart) |

---

## Sprint 1den Tasinan Gorevler (Carry-over)

| Gorev | Sprint 2 Plani |
|-------|---------------|
| Cross-DB SQL testleri (30 x 3 kisi) | Hafta 2de tamamlanacak |
| Analysis Engine testi | Dusuk oncelik |
| ML Engine testi | Dusuk oncelik |

---

## Onemli Kurallar

1. **Branch kurali**: main ve developa direkt push yapilmaz
2. **PR sureci**: Bug fixler PR ile developa, PO onaylar
3. **Commit mesaji**: Bug duzeltmelerinde ne vardi, nasil duzeltildi yazilir
4. **Deploy**: Sadece PO (Mehmet) tetikler
5. **Sorun bildirimi**: Once Scrum Mastera (Gozde), gerekirse POya eskale
6. **Hafta sonlari**: Sprintten sayilmaz 
