# AskDB — Git Rehberi

---

## !! MASTER VE DEVELOP BRANCH'LERE DIREKT PUSH YAPILMAZ !!

## !! BU KURALA UYMAYAN COMMIT REVERT EDILIR !!

---

## 1. Ilk Kurulum (Bir Kere Yapilir)

```bash
# Repoyu klonla
git clone https://github.com/mmehmetisik/askdb.git
cd askdb

# Virtual environment olustur
python -m venv .venv

# Windows:
.venv\Scripts\activate

# Mac/Linux:
source .venv/bin/activate

# Bagimliliklari yukle
pip install -r requirements.txt

# .env dosyasini olustur (Mehmet'ten alacaksiniz)
cp .env.example .env
# .env dosyasindaki degerleri doldurun

# Sunucuyu baslat (test icin)
uvicorn backend.main:app --reload --port 8000

# Testleri calistir
pytest tests/ -v
```

## 2. Yeni Gorev Baslatma

```bash
# Once develop'u guncelle (MASTER'DAN DEGIL, DEVELOP'DAN!)
git checkout develop
git pull origin develop

# Yeni branch olustur (gorev adini yaz)
git checkout -b feature/gorev-adi

# Ornekler:
# git checkout -b feature/ml-engine-docs
# git checkout -b fix/cache-ttl-bug
# git checkout -b docs/auth-service-md
```

> **DIKKAT**: Branch'inizi her zaman **develop**'dan acin, master'dan degil!

### Branch Isimlendirme Kurallari

| Tur | Format | Ornek |
|-----|--------|-------|
| Yeni ozellik | `feature/aciklama` | `feature/ml-model-export` |
| Bug duzeltme | `fix/aciklama` | `fix/login-redirect-bug` |
| Dokumantasyon | `docs/aciklama` | `docs/database-md` |
| Test | `test/aciklama` | `test/analysis-engine` |

## 3. Kod Yazma + Commit

```bash
# Degisiklikleri gor
git status

# Dosyalari staging'e ekle
git add dosya1.py dosya2.md

# DIKKAT: "git add ." KULLANMAYIN — sadece ilgili dosyalari ekleyin

# Commit yap
git commit -m "Aciklayici commit mesaji"

# Push et (ilk push'ta -u flag'i kullan)
git push -u origin feature/gorev-adi

# Sonraki push'larda sadece:
git push
```

## 4. Pull Request (PR) Acma

1. GitHub'a git: https://github.com/mmehmetisik/askdb
2. Sari banner gorunur: **"Compare & pull request"** butonuna tikla
3. **ONEMLI**: PR'in hedef branch'inin **develop** oldugunu kontrol et!
   - Dogru: `feature/gorev-adi` → `develop`
   - **YANLIS**: `feature/gorev-adi` → `master` (BUNU YAPMAYIN!)
4. Bilgileri doldur:
   - **Title**: Kisa aciklama (ornek: "Add ML engine documentation")
   - **Description**: Ne yaptin, neden yaptin
5. Sag taraftan:
   - **Reviewers**: `gkizilkaya` (Scrum Master) ekle
   - **Assignees**: Kendini ekle
6. **"Create pull request"** tikla
7. Testlerin gecmesini bekle (yesil tik)
8. Scrum Master review edecek → PO onaylayacak → merge edilecek (develop'a)

## 5. PR Onaylandiktan Sonra

```bash
# develop'a geri don
git checkout develop

# Guncellemeleri cek
git pull origin develop

# Eski branch'i sil (opsiyonel)
git branch -d feature/gorev-adi
```

## 6. Sikca Kullanilan Komutlar

```bash
# Durum kontrolu
git status

# Tum degisiklikleri gor
git diff

# Branch listesi
git branch

# Branch degistir
git checkout branch-adi

# develop'dan guncellemeleri al (kendi branch'indeyken)
git pull origin develop

# Son commit'leri gor
git log --oneline -5
```

## 7. Sorun Giderme

### "Your branch is behind 'origin/develop'"
```bash
git checkout develop
git pull origin develop
git checkout feature/gorev-adi
git merge develop
```

### Yanlis branch'e commit ettim
```bash
# Commit'i geri al (degisiklikler korunur)
git reset --soft HEAD~1
# Dogru branch'e gec
git checkout dogru-branch
# Tekrar commit et
git add . && git commit -m "mesaj"
```

### Merge conflict cikti
1. Cakisan dosyalari ac
2. `<<<<<<<` ve `>>>>>>>` isaretlerini bul
3. Dogru versiyonu sec, isaretleri sil
4. `git add dosya.py && git commit -m "Resolve merge conflict"`
