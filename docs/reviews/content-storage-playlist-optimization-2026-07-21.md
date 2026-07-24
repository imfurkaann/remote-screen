# Medya, Depolama, Ekran Kaydetme ve Playlist Optimizasyonu

Tarih: 21 Temmuz 2026

## Sonuç

Medya yükleme, medya depolama, ekran ayarı kaydetme, playlist oluşturma/güncelleme ve binlerce cihaza yayınlama akışları yeniden düzenlendi. Kritik yarış koşulları, sınırsız liste sorguları, istemci MIME türüne güvenilmesi, tekrar gönderilen isteklerin çift kayıt üretmesi ve eski playlist sürümünün yeni veriyi ezmesi engellendi.

## Medya yükleme ve depolama

- Dosya SHA-256 özeti ve gerçek dosya imzası tek akışta okunuyor; istemcinin gönderdiği MIME türüne güvenilmiyor.
- JPEG, PNG, GIF, WebP, WebM ve MP4/QuickTime içerikleri magic-byte ile doğrulanıyor.
- Dosya uzantısı gerçek içerik türüne göre düzeltiliyor ve dosya adı güvenli hale getiriliyor.
- Geçici yüklemeler ayrı `.tmp` alanında tutuluyor; hata veya yinelenen yüklemede artık dosyalar temizleniyor.
- Dosyalar tenant/kullanıcı/checksum-prefix dizilimiyle parçalı depolanıyor. Böylece tek klasörde yüz binlerce dosya oluşması önleniyor.
- Aynı hesaba ait aynı checksum için MongoDB seviyesinde benzersiz indeks eklendi. Birden çok backend düğümünden aynı anda gelen aynı dosyalarda yalnızca tek medya kaydı kalıyor.
- Maksimum dosya boyutu ortam değişkeniyle yönetiliyor ve limit aşımı `413` dönüyor.
- Path traversal ve depolama kökü dışındaki dosyaların silinmesi engellendi.
- Dashboard medya sayfasına tek seçimde en fazla 100 dosya ve üç eşzamanlı worker ile kontrollü toplu yükleme eklendi. Bu yaklaşım tarayıcıyı ve backend bağlantı havuzunu aşırı yüklemeden aktarım yapıyor.
- Medya listeleme sunucu tarafında sayfalı ve aramalı çalışıyor; sorgular en fazla 200 kayıtla sınırlandırılıyor.

## Playlist oluşturma, kaydetme ve yayınlama

- Playlist adı normalize ediliyor; aynı kullanıcı için büyük/küçük harf ve boşluk farklılığıyla mükerrer ad oluşması engellendi.
- `request_id` idempotency anahtarı eklendi. Ağ tekrarları aynı playlisti ikinci kez oluşturmak yerine mevcut sonucu döndürüyor.
- Playlist öğelerinde geçerli medya kimliği, benzersiz/sıralı pozisyon ve 1 saniye-24 saat arası süre doğrulaması yapılıyor.
- İçerik checksum'u medya URL'si, checksum, MIME türü, süre ve pozisyonu kapsıyor.
- Güncelleme ve yayınlamada `expected_version` ile optimistic concurrency kullanılıyor. Eski ekran sekmesi yeni playlist içeriğini artık sessizce ezemiyor.
- Değişiklik içermeyen kayıtlar sürüm artırmıyor.
- Playlist listesi sunucu tarafı arama ve pagination kullanıyor; öğe sayısı aggregation ile hesaplanıyor ve tüm item dizileri gereksiz yere dashboard'a taşınmıyor.
- Yeni ve mevcut playlist editörlerinde medya araması sunucu tarafında, 50 kayıtlık sayfalar halinde ve 250 ms debounce ile çalışıyor.
- Yayınlamadan önce bütün hedef cihazların erişilebilirliği doğrulanıyor. Hatalı hedef varsa kısmi atama yapılmıyor.
- Cihaz playlist ataması tek `updateMany` işlemiyle yapılıyor; PostgreSQL shadow senkronları paralel yürütülüyor ve Socket.IO yayınında tek kanonik fleet fan-out korunuyor.
- Yayın sonucu playlist sürümü, checksum ve hedef cihaz sayısını döndürüyor.

## Ekran kaydetme

- Tek ekran ayar güncellemesi iki MongoDB okuma/yazma turundan tek atomik `findOneAndUpdate` işlemine indirildi.
- Yalnızca gerçekten değişen orientation/timezone/scale-mode değerleri için cihaz komutu oluşturuluyor.
- Toplu ekran işlemleri erişim kapsamını koruyarak `updateMany` kullanmaya devam ediyor; cihaz başına ayrı veritabanı güncellemesi yapılmıyor.

## Veri tabanı ve dağıtım

MongoDB içerik migrasyonu mevcut verileri normalize eder, playlist checksum/sürüm alanlarını doldurur ve benzersiz indeksleri güvenli biçimde oluşturur. Çakışan medya checksum'u veya normalize playlist adı bulursa otomatik devam etmek yerine dağıtımı durdurur.

Önerilen üretim sırası:

1. Veritabanı yedeği ve mevcut medya volume snapshot'ı alın.
2. PostgreSQL migrasyonunu çalıştırın: `npm run db:migrate:pg -w backend`.
3. İçerik migrasyonunu çalıştırın: `npm run db:migrate:content -w backend`.
4. Hesap sahipliği migrasyonunu çalıştırın: `npm run db:migrate:accounts -w backend`.
5. Üretimde `MONGO_AUTO_INDEX=false` kullanın.
6. Birden fazla backend instance varsa `MEDIA_STORAGE_ROOT` tüm instance'ların bağlandığı ortak, kalıcı bir volume olmalıdır.
7. CDN veya ayrı origin kullanılıyorsa `MEDIA_PUBLIC_BASE_URL` bu volume'un public karşılığına ayarlanmalıdır.

Yeni ortam ayarları:

- `MEDIA_STORAGE_ROOT`
- `MEDIA_PUBLIC_BASE_URL`
- `MEDIA_MAX_FILE_BYTES`

## Doğrulama

- TypeScript tip kontrolü: başarılı.
- Backend otomatik testleri: 75/75 başarılı.
- Dashboard otomatik testleri: 5/5 başarılı.
- Toplam otomatik test: 80/80 başarılı.
- Backend üretim derlemesi: başarılı.
- Dashboard Next.js üretim derlemesi ve 42 sayfanın oluşturulması: başarılı.
- Android `assembleDebug` kalite doğrulaması: başarılı (`ktlintCheck` görevi projede tanımlı olmadığı için mevcut kalite scriptinin fallback yolu kullanıldı).
- `git diff --check`: whitespace hatası yok.

## Operasyonel not

Mevcut uygulama ortak kalıcı volume ile yatay ölçeklenebilir. Çok bölgeli veya çok yüksek trafik hedefinde bir sonraki doğal adım, aynı `MediaStorage` sözleşmesinin S3 uyumlu object storage adaptörüyle uygulanması ve doğrudan multipart/presigned yükleme kullanılmasıdır. Mevcut servis ayrımı bu geçiş için hazırlandı; uygulama rotalarının yeniden yazılması gerekmeyecek.
