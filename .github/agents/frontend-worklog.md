# Frontend Worklog

Date: 2026-04-02
Owner: Frontend, Dashboard
Status: Active

## Purpose

Bu dosya frontend ile ilgili değişiklikleri, alınan hataları, verilen kararları ve doğrulama sonuçlarını tek yerde tutmak için kullanılır.

## How To Use

- Yeni frontend değişikliği yapmadan önce ilgili maddeyi buraya not et.
- Karşılaşılan hataları kısa ve net yaz.
- Çözülen maddeleri tarihle birlikte kapat.
- Test veya doğrulama sonucu varsa mutlaka ekle.
- Belirsiz kalan kararları ayrıca işaretle.

## Current Notes

- Authentication/session akışı için `dashboard_session` ve `dashboard_access_token` ayrımı var.
- Dashboard API proxy'leri cookie tabanlı token ile backend'e yetkili istek atıyor.
- 401 hataları genelde oturum yokluğu, token süresi dolması veya backend JWT reddi anlamına geliyor.

## Change Log

### 2026-04-02
- Operations dashboard'a troubleshoot panel eklendi.
- Support bundle export eklendi.
- Alert evaluation görünümü eklendi.
- Playlists sayfasındaki 401 hatası, auth/session akışı açısından incelendi.

## Errors Observed

- `GET /api/content/playlists` 401 Unauthorized
- `GET /api/content/devices` 401 Unauthorized

## Decisions

- Frontend değişiklikleri test aşamasına geçmeden önce bu dosyada izlenecek.
- Önce oturum ve proxy akışları düzeltilip sonra UI düzenlemeleri yapılacak.

## Verification

- Backend lint: PASS
- Dashboard lint: PASS
- Android compileDebugKotlin: PASS
- Support drill: PASS
