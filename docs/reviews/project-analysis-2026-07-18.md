# Remote Screen Proje Analiz Raporu

Tarih: 18 Temmuz 2026  
Kapsam: Backend, Next.js dashboard, Android player, veri modeli, güvenlik, test/CI ve 10.000+ ekran ölçeklenebilirliği  
İncelenen durum: Çalışma dizininin mevcut hali; commit edilmemiş `apps.route.ts` ve uygulama yapılandırma ekranı değişiklikleri dahil

## Yönetici özeti

Proje; tenant ayrımı, çevrimdışı içerik önbelleği, checksum doğrulaması, Android açılış dayanıklılığı, komut kayıtları ve operasyon dokümantasyonu açısından iyi bir temel oluşturuyor. Ancak mevcut haliyle binlerce ekranlı üretim ortamına çıkmaya hazır değil.

Üretime geçişi engelleyen başlıca konular:

1. Cihaz Socket.IO kanalı kimlik doğrulaması yapmıyor. Sadece istemcinin bildirdiği `device_id` değerine güveniyor.
2. Her APK içine aynı bootstrap anahtarı gömülüyor; bu anahtar cihaz oturumu alma ve cihaz eşleşmesini kaldırma gibi güçlü işlemlerde kullanılıyor.
3. Herkese açık RSS proxy, verilen herhangi bir URL'yi sunucu tarafından çağırıyor; bu doğrudan SSRF riskidir.
4. Socket odaları, komut zamanlayıcıları, heartbeat tamponu ve metrikler yalnızca tek Node.js sürecinin belleğinde. Birden fazla backend kopyasında komut ve olay teslimi güvenilir değil.
5. Android istemci HTTPS hatasında otomatik olarak HTTP'ye düşüyor; token, içerik ve komut trafiği ağ üzerinde ele geçirilebilir/değiştirilebilir.
6. Backend şu anda TypeScript kalite kontrolünden geçmiyor ve kök üretim derlemesi bu nedenle başarısız olacaktır.
7. Yüklenen tenant medyaları, ekran görüntüleri ve bir test token dosyası Git tarafından izleniyor. Bu hem veri sızıntısı hem de depo büyümesi riskidir.
8. Dashboard tüm ekranları 30 saniyede bir yeniden indiriyor ve DOM'a basıyor; sunucu tarafı arama/paginasyon/virtualization kullanılmıyor.

Genel karar: **Üretim için hazır değil.** Önce güvenlik ve dağıtık komut teslim mimarisi düzeltilmeli; ardından dashboard ve veri erişimi ölçeklendirilmelidir.

## Doğrulama sonuçları

| Kontrol | Sonuç | Not |
|---|---:|---|
| Backend testleri | Başarılı | 56/56 test geçti |
| Dashboard testleri | Yetersiz | Test komutu başarılı fakat 0 test çalıştı |
| Dashboard TypeScript | Başarılı | `tsc --noEmit` geçti |
| Backend TypeScript | Başarısız | 4 derleme hatası var |
| Android debug derlemesi | Başarılı | `assembleDebug` geçti |
| Kotlin lint | Yok | `ktlintCheck` görevi tanımlı değil; script derlemeye düşüyor |
| CI Android kontrolü | Yetersiz | Yalnızca `.editorconfig` varlığını kontrol ediyor, Android'i derlemiyor |

Backend derleme hataları:

- Socket komut sözleşmesinde `CLEAR_CACHE`, `FACTORY_RESET`, `GET_DIAGNOSTICS` tipleri yok (`backend/src/sockets/registry.ts:24-29`, `backend/src/services/command.service.ts:157-172`).
- Eşleşmemiş cihazlarda `tenantId` null olabildiği halde PostgreSQL durum güncellemesi string bekliyor (`backend/src/sockets/index.ts:188`, `backend/src/sockets/index.ts:331`).

## Kritik bulgular

### P0-01 — Cihaz socket kanalında kimlik doğrulama yok

`/dashboard` namespace JWT doğruluyor, `/device` namespace ise yalnızca handshake içindeki `device_id` değerini alıp ilgili odaya katılıyor (`backend/src/sockets/index.ts:118-164`, `backend/src/sockets/index.ts:164-181`). Android de token göndermiyor; yalnızca cihaz kimliği gönderiyor (`android-player/.../SocketClientManager.kt:74-84`).

Etkisi:

- Cihaz ID'sini bilen saldırgan gerçek ekranın odasına katılabilir.
- O ekrana gönderilen playlist URL'lerini ve uzaktan yönetim komutlarını alabilir.
- Sahte `HEARTBEAT` ile ekranı çevrimiçi gösterebilir.
- Sahte `COMMAND_ACK` göndererek komutları tamamlanmış/başarısız gösterebilir.
- Gerçek cihazla aynı anda bağlanıp çift komut çalışmasına yol açabilir.

Öneri:

- Device namespace için zorunlu kısa ömürlü cihaz JWT veya mTLS kullanın.
- JWT içindeki `sub`, `hardware_id`, `tenant_id`, cihaz kaydı ve aktif/eşleşmiş durumunu doğrulayın.
- Socket olay payload'ındaki `device_id` değerine güvenmeyin; kimliği socket oturumundan türetin.
- Aynı cihazın aktif bağlantı sayısını/connection epoch değerini tutun; eski bağlantıların ACK ve heartbeat'lerini reddedin.
- Bu yol için sahte cihaz, cross-tenant oda ve ACK spoofing entegrasyon testleri ekleyin.

### P0-02 — APK içine gömülü ortak bootstrap anahtarı güçlü yetkiler veriyor

Bootstrap anahtarı `BuildConfig` içine derleme zamanında gömülüyor (`android-player/app/build.gradle.kts:36-44`). Aynı anahtar `request-code`, `device-session` ve `unpair` uçlarını koruyor (`backend/src/routes/pairing.route.ts:35-39`, `186-190`, `252-256`). `unpair` yalnızca hardware ID ve bu ortak anahtarla cihazı tenant'tan çıkarabiliyor.

Etkisi:

- APK'dan anahtar çıkarıldığında bütün filo için ortak sır açığa çıkar.
- Hardware ID bilen saldırgan cihaz oturumu isteyebilir veya cihazı uzaktan eşleşmeden çıkarabilir.
- Tek anahtar rotasyonu tüm filonun aynı anda güncellenmesini gerektirir.

Öneri:

- Bootstrap anahtarını kimlik doğrulama sırrı olarak kullanmayın.
- İlk kurulumda cihaz başına benzersiz, tek kullanımlık enrollment credential üretin.
- Eşleşmeden sonra Android Keystore içinde cihaz özel anahtarı oluşturun; cihaz sertifikası veya imzalı challenge kullanın.
- `unpair` işlemini kullanıcı yetkisi + cihaz kimliği + audit ile koruyun; global bootstrap key ile açmayın.

### P0-03 — Herkese açık RSS proxy SSRF açığı oluşturuyor

`GET /api/v1/apps/rss-proxy` authentication middleware'den önce tanımlı ve query parametresindeki URL doğrudan `fetch` ediliyor (`backend/src/routes/apps.route.ts:65-112`). Protokol, DNS sonucu, özel IP blokları, redirect, cevap boyutu ve timeout kontrolü yok.

Etkisi:

- Cloud metadata servisleri, localhost, veritabanı yönetim panelleri ve özel ağ servisleri çağrılabilir.
- Büyük veya hiç bitmeyen cevaplarla kaynak tüketimi yapılabilir.
- Açık proxy olarak kötüye kullanılabilir.

Öneri:

- Acil olarak endpoint'i kapatın veya authentication arkasına alın.
- Yalnızca `https`, açık allowlist domainleri, DNS sonrası public IP doğrulaması ve redirect başına yeniden doğrulama kullanın.
- Kısa connect/response timeout, maksimum byte ve maksimum redirect limiti koyun.
- RSS çekimini request thread'i yerine sınırlı worker kuyruğunda çalıştırın ve cache'leyin.

### P0-04 — Yatay ölçeklemede socket ve komut teslimi çalışmıyor

Socket server referansı process-local singleton (`backend/src/sockets/registry.ts:3-7`). Redis adapter veya başka bir pub/sub katmanı yok. API isteğini alan node yalnızca kendi socket odalarına emit ediyor. Komut timeout'ları da process içi `Map` içinde tutuluyor (`backend/src/services/command.service.ts:8`, `62-117`).

10.000+ cihaz için etkisi:

- M backend kopyasında API isteği cihazın bağlı olduğu node'a düşmezse komut socket'e ulaşmaz.
- Deploy/restart sırasında aktif timeout ve retry bilgisi kaybolur.
- Bir node'daki kullanıcı devre dışı bırakıldığında diğer node'lardaki socketleri açık kalır.
- Per-process metrikler filonun yalnızca bir parçasını gösterir.

Öneri:

- Socket.IO Redis adapter veya eşdeğer dağıtık pub/sub kullanın.
- Komutları Redis Streams, RabbitMQ, NATS JetStream veya Kafka gibi dayanıklı bir kuyruğa yazın.
- Dispatch worker; idempotency key, visibility timeout, retry/backoff ve dead-letter queue ile çalışsın.
- API'nin başarısı `emit edildi` değil `kuyruğa kalıcı yazıldı` anlamına gelsin.
- Her komut için `created -> queued -> delivered -> acked -> completed/failed/expired` durum makinesi kurun.

### P0-05 — HTTPS hatasında HTTP'ye otomatik düşülüyor

Android interceptor herhangi bir SSL doğrulama hatasında URL şemasını `https`ten `http`ye çevirip aynı isteği tekrar gönderiyor (`SafeTimeAndHttpInterceptor.kt:28-60`). Manifest cleartext trafiğe izin veriyor ve user CA sertifikalarına güveniyor (`AndroidManifest.xml:18-27`, `network_security_config.xml:2-8`).

Etkisi:

- Cihaz JWT'si, playlist bilgisi ve telemetri düz metin taşınabilir.
- Ağdaki saldırgan içerik URL'lerini veya API cevaplarını değiştirebilir.
- Yanlış saat problemi güvenlik katmanını kaldırarak çözülmüş oluyor.

Öneri:

- Production build'de cleartext'i tamamen kapatın ve HTTP fallback'i kaldırın.
- Saat problemi için secure NTP, cihaz yönetim politikası veya yalnızca imzalı time bootstrap mekanizması kullanın.
- Network security config'i build type'a göre ayırın; debug ortamında belirli LAN hostları dışında cleartext açmayın.
- Uygunsa certificate pinning ve imzalı içerik manifesti ekleyin.

### P0-06 — Tenant içerikleri ve token Git deposunda izleniyor

Git sekiz adet `backend/uploads` dosyasını, ayrıca `test_token.txt` dosyasını izliyor. Dosya adlarından en az birinin kullanıcı kaynaklı WhatsApp görseli olduğu görülüyor. `.gitignore` içinde `backend/uploads/` ve `test_token.txt` kuralları yok (`.gitignore:38-41`).

Etkisi:

- Tenant verisi ve olası kimlik bilgileri repository erişimi olan herkese ve Git geçmişine yayılır.
- Dosyayı son commit'ten silmek geçmişten kaldırmaz.
- Depo boyutu medya kullanımıyla sürekli büyür.

Öneri:

- Token'ı derhal iptal/rotate edin; gerçek tenant verisini repository'den ve gerekiyorsa Git geçmişinden güvenli biçimde temizleyin.
- `backend/uploads/`, `test_token.txt`, yerel ekran görüntüleri ve runtime artefaktlarını ignore edin.
- Secret scanning ve push protection ekleyin.
- Demo fixture gerekiyorsa sentetik, lisanslı ve kişisel veri içermeyen küçük dosyalar kullanın.

## Yüksek öncelikli bulgular

### P1-01 — Dashboard ekran listesi binlerce cihaz için ölçeklenmiyor

Dashboard parametresiz `/api/content/devices` çağırıyor, bütün cihazları belleğe alıyor ve 30 saniyede bir playlistlerle birlikte yeniden çekiyor (`dashboard/.../screens/page.tsx:199-240`). Arama, gruplama ve listeleme client tarafında bütün dizi üzerinde yapılıyor (`244-272`, `524-605`, `686-765`). Virtualized liste yok.

Örnek etki: 100 açık operatör ekranı ve 10.000 cihaz, yalnızca cihaz listesi için her 30 saniyede 1 milyon kayıt veya saniyede ortalama 33.333 kayıt transferi/serileştirmesi anlamına gelir.

Öneri:

- Cursor tabanlı server-side pagination, filtreleme, sıralama ve projection kullanın.
- İlk listede yalnızca kimlik, ad, grup, durum, son görülme ve özet içerik bilgisi dönün.
- React Window/TanStack Virtual gibi virtualization kullanın.
- 30 saniyelik tam refetch yerine değişiklik olayları veya özet sayaç + görünür satırlar için delta güncellemesi kullanın.
- Aramayı debounce edin ve server-side index destekli çalıştırın.

### P1-02 — Toplu işlemler N adet HTTP isteğine ve N adet emit'e dönüşüyor

Yeni grup oluşturma seçilen her ekran için aynı anda ayrı PUT çağrısı gönderiyor (`screens/page.tsx:169-182`). 5.000 ekran seçimi 5.000 eşzamanlı HTTP isteği demektir. Playlist publish, cihaz başına iki ayrı socket emit yapıyor (`content.route.ts:985-989`).

Öneri:

- `POST /device-bulk-jobs` benzeri job tabanlı API ekleyin.
- Filtre snapshot'ı veya selection token ile “sorgudaki tüm cihazlar” seçimini destekleyin.
- DB güncellemesini `updateMany`, socket dağıtımını grup/tenant topic ve kontrollü batch ile yapın.
- İlerleme, başarılı, başarısız, atlanan ve yeniden denenebilir cihaz sayılarını dashboard'da gösterin.

### P1-03 — Heartbeat tamponu gerçek bir batch write değil

Tampon her 15 saniyede Map'i boşaltıp cihaz başına ayrı `updateOne` promise'i oluşturuyor (`sockets/index.ts:77-92`). 10.000 cihaz aynı pencereye denk gelirse 10.000 eşzamanlı güncelleme başlatılır. Heartbeat 30 saniyeyse ortalama yazma sayısı yine yaklaşık 333/s'dir; sadece burst şekli değişir.

Ek problemler:

- Flush öncesi process çökerse son heartbeatler kaybolur.
- PostgreSQL `last_seen` heartbeatlerde güncellenmiyor; yalnızca connect/disconnect durumu eşleniyor.
- Socket disconnect anında offline yazılıyor; aynı cihazın başka aktif bağlantısı varsa yanlış offline oluşur.

Öneri:

- Mongo `bulkWrite` ile kontrollü batch boyutu ve concurrency kullanın.
- Presence'i Redis TTL anahtarları/zset ile yönetin; DB'ye daha seyrek snapshot alın.
- Online durumunu tek boolean yerine `last_seen + TTL + active_connection_count` üzerinden türetin.
- Reconnect storm load testi yapın.

### P1-04 — Backend başlatıldığında bütün ekranlar offline yapılıyor

Her backend bootstrap'ında MongoDB ve PostgreSQL'deki tüm cihazların durumu offline'a çekiliyor (`backend/src/index.ts:137-149`).

Etkisi:

- Rolling deploy sırasında yeni tek bir node açılması bütün filoyu offline gösterir.
- Birden fazla node birbirinin canlı bağlantı durumunu bozar.
- Büyük koleksiyonda her deploy toplu write yükü üretir.

Öneri:

- Bu global reset'i kaldırın.
- Presence'i lease/TTL tabanlı yapın; eski kayıtlar kendiliğinden offline kabul edilsin.
- Node kapanışında yalnızca o node'a ait connection lease'lerini bırakın.

### P1-05 — Komut retry ve ACK akışı restart güvenli değil

Timeoutlar bellekte tutuluyor ve startup sırasında `queued/sent/acknowledged` komutları geri yükleyen worker yok (`command.service.ts:8-117`). İlk dispatch, hedef cihaz çevrimdışı olsa bile `sent` işaretleniyor (`119-175`). Cihaz tekrar bağlandığında bekleyen komutlar yeniden gönderilmiyor; sadece konfigürasyon ve playlist push ediliyor (`sockets/index.ts:193-267`).

Öneri:

- Kalıcı command outbox + worker kurun.
- “socket odasında alıcı var” ile “cihaz teslim aldı” durumlarını ayırın.
- Cihaz bağlantısında teslim edilmemiş ve süresi dolmamış komutları sırayla replay edin.
- Android tarafında command ID bazlı kalıcı idempotency tablosu kullanın; özellikle reboot/factory reset gibi komutları iki kez çalıştırmayın.

### P1-06 — Yerel disk medya mimarisi yatay ölçek ve gizlilik için uygun değil

Medya backend node'un yerel diskine taşınıyor (`content.route.ts:462-482`), `/uploads` ise auth olmadan statik yayınlanıyor (`backend/src/app.ts:29`). Screenshot da process belleğine alınarak yerel diske yazılıyor (`command.route.ts:18`, `107-147`).

Etkisi:

- Diğer backend node'ları aynı dosyayı görmez.
- Container/VM değişiminde içerik kaybolabilir.
- URL'yi bilen herkes tenant medyasını ve ekran görüntüsünü açabilir.
- CDN, range request, lifecycle, kota ve antivirüs akışı yok.

Öneri:

- S3 uyumlu object storage + CDN kullanın.
- Cihaz için kısa ömürlü signed URL veya tenant kontrollü download token üretin.
- Multipart/resumable upload, MIME sniffing, malware scan, transcoding ve thumbnail worker ekleyin.
- Tenant/storage kotası ve lifecycle politikası uygulayın.

### P1-07 — Public uygulama renderer'da XSS/enjeksiyon riski var

Uygulama renderer authentication olmadan `MediaModel.findById` ile tenant kontrolü olmaksızın HTML döndürüyor (`apps.route.ts:19-63`). Kullanıcı kontrollü ad/config değerleri HTML, CSS ve script template'lerine doğrudan gömülüyor; örneğin `${title}`, `${logoUrl}` ve `JSON.stringify(config)` script içine yazılıyor (`apps.route.ts:289-319`, `893-894`, `972`). `</script>` gibi değerler güvenli escape edilmiyor.

Öneri:

- Renderer'ı ayrı origin/sandbox domaininde çalıştırın.
- Config'i schema ile doğrulayın; HTML attribute, CSS ve JS context'ine göre escape edin.
- Inline script yerine nonce tabanlı sıkı CSP kullanın; `frame-ancestors`, `connect-src`, `img-src` allowlist tanımlayın.
- Tahmin edilebilir Mongo ID yerine imzalı render tokenı kullanın.

### P1-08 — Pairing işlemi atomik değil ve session sözleşmesi tutarsız

Confirm önce kullanılmamış kodu okuyor, sonra cihazı güncelliyor, en son `consumedAt` yazıyor (`pairing.route.ts:122-166`). Eşzamanlı iki istek aynı kodu tüketebilir. Device JWT 48 saatlik üretilirken cevap `expires_in` alanında 12 saat bildiriyor (`210-245`).

Ayrıca ortak auth middleware ObjectId biçimli tüm `sub` değerlerini User koleksiyonunda arıyor (`auth.ts:45-57`). Device JWT'nin `sub` alanı cihaz ObjectId'si olduğundan screenshot upload gibi `role=device` HTTP yolları bu middleware'de reddedilir.

Öneri:

- Pairing code tüketimini `findOneAndUpdate({consumedAt:null, expiresAt:...})` veya transaction ile atomik yapın.
- User ve device token doğrulamasını ayrı middleware/signer/audience ile ayırın.
- Token TTL ile `expires_in` değerini tek kaynaktan üretin.
- Device credential rotasyonu ve revoke listesi ekleyin.

### P1-09 — Liste sorguları ve indeksler büyük veri için eksik

Device endpointi pagination parametresi verilmezse sınırsız sonuç döndürüyor. `page` ve `limit` için üst/alt sınır yok (`content.route.ts:162-195`). Search girdisi escape edilmeden regex'e giriyor (`176-181`). Liste `updatedAt` ile sıralanıyor fakat bu erişim desenini karşılayan compound index yok (`device.model.ts:65-67`). Media, playlist, user ve super-admin listeleri de sınırsız.

Öneri:

- Bütün listelerde zorunlu maksimum limit ve cursor pagination kullanın.
- Regex girdisini escape edin; prefix/token search için uygun index veya arama servisi kullanın.
- Temel indeksler: `(tenantId, status, updatedAt desc)`, `(tenantId, screenGroup, updatedAt desc)`, `(tenantId, pairedOwnerUserId, updatedAt desc)`.
- `explain("executionStats")` ile gerçek tenant büyüklüklerinde doğrulayın.

### P1-10 — PostgreSQL RLS tasarlanmış fakat request context uygulanmamış

Migrationlar `current_setting('app.tenant_id')` tabanlı RLS policy oluşturuyor (`001_initial_postgres.sql:51-60`, `002_shadow_content_and_commands.sql:68-82`). Uygulama ise genel bir pool döndürüyor (`postgres.ts:16-39`) ve repository işlemlerinde `SET LOCAL app.tenant_id`/transaction context kullanılmıyor. Kod aramasında context ayarı yalnızca dokümanlarda bulunuyor.

Etkisi:

- RLS ya sorguları beklenmedik biçimde engeller ya da tablo sahibi/BYPASSRLS kullanıcıyla tamamen devre dışı kalır.
- Savunma katmanı olarak güvenilemez.
- Mongo + PostgreSQL best-effort shadow write ve rastgele read yüzdesi kullanıcıların farklı cevaplar görmesine yol açabilir.

Öneri:

- Tek bir system of record ve migration bitiş kriteri belirleyin.
- Her tenant işlemini transaction içinde `SET LOCAL app.tenant_id` ile çalıştırın; uygulama rolüne `BYPASSRLS` vermeyin ve gerekiyorsa `FORCE ROW LEVEL SECURITY` kullanın.
- Shadow write başarısızlıklarını sadece loglamak yerine durable outbox/reconciliation kuyruğuna alın.

## Orta öncelikli bulgular

### P2-01 — Authentication hardening eksik

- Login endpointinde rate limit, hesap bazlı gecikme/lockout ve MFA yok (`auth.route.ts:19-80`).
- Middleware token içindeki role/tenant değerini mevcut kullanıcı kaydıyla karşılaştırmıyor; rol değişikliği eski token bitene kadar etkili olmayabilir (`auth.ts:45-80`).
- CORS varsayılanı `*` ve credentials açık (`config/env.ts`, `app.ts:20-27`).
- Helmet/CSP/HSTS ve proxy trust konfigürasyonu yok.

Öneri: merkezi rate limiting, MFA/WebAuthn, kısa access token + refresh rotation, anlık session revoke, açık origin allowlist, Helmet ve güvenli proxy ayarları.

### P2-02 — Health ve metrikler üretim durumunu doğru temsil etmiyor

`/health` her zaman `ok: true` döndürüyor ve Mongo bağlantısını kontrol etmiyor (`health.route.ts:10-27`). `/metrics` ve `/health/detailed` auth olmadan açık (`33-65`). Metrikler yalnızca process belleğinde ve büyük ölçüde PostgreSQL migration ölçümleriyle sınırlı.

Eksik temel metrikler:

- Aktif socket sayısı, tenant/region bazlı cihaz durumu
- Reconnect oranı ve reconnect storm
- Command queue depth, enqueue-to-delivery ve delivery-to-ACK latency
- ACK success/timeout/duplicate oranı
- Heartbeat lag, flush süresi ve dropped heartbeat
- Media download başarısı, cihaz cache doluluğu, playback error ve stale content

### P2-03 — Veri modeli filo yönetimi için fazla serbest metin içeriyor

`screenGroup`, `operatingHours`, memory alanları ve diagnostics büyük ölçüde string/Mixed tutuluyor (`device.model.ts`). Grup ayrı bir entity değil; bu nedenle isim değiştirme, silme, yetki, hiyerarşi ve toplu atama güvenilir değil. Desired state/reported state ayrımı yok.

Öneri:

- `DeviceGroup`, tag, site/location hierarchy ve saved filter modelleri ekleyin.
- `desiredConfigVersion` ve `reportedConfigVersion` ile drift görünürlüğü sağlayın.
- Byte değerlerini number/long, schedule'ı doğrulanmış timezone-aware schema olarak saklayın.

### P2-04 — Komut audit kaydı aktörü ve gerekçeyi tutmuyor

Command kaydı cihaz ve sonucu tutuyor fakat komutu kimin, hangi IP'den, hangi toplu iş kapsamında ve hangi gerekçeyle verdiğini saklamıyor (`command.model.ts`). Factory reset, screen off veya reboot gibi işlemler için onay politikası yok.

Öneri: immutable audit event, actor/session/correlation/bulk-job alanları, kritik komutlarda iki aşamalı onay ve tenant politikası.

### P2-05 — Dashboard filo operasyonu özellikleri eksik

Binlerce ekran için gerekli fakat mevcut ana ekran akışında görülmeyen özellikler:

- Server-side facet filtreleri: online/degraded/offline, version, site, tag, content drift, son hata
- “Bu sorgudaki tüm ekranları seç” ve selection token
- Job progress, partial failure ve retry failed only
- Saved views, paylaşılabilir filtreler ve kullanıcıya göre kolonlar
- Version compliance, staged rollout/canary ve rollback görünümü
- Alarm triage, maintenance mode ve acknowledgement/snooze
- Filo sağlık trendleri; yalnızca anlık kart görünümü yeterli değil

### P2-06 — Test ve CI güvenlik ağı kritik yolları kapsamıyor

- Dashboard test komutu 0 test çalıştırıyor.
- Socket device authentication, multi-node delivery, reconnect race ve forged ACK testleri yok.
- Android CI gerçek derleme yapmıyor; yalnızca `.editorconfig` varlığını kontrol ediyor (`.github/workflows/ci.yml`).
- `ktlintCheck` görevi yok fakat yerel script bunu fallback ile başarılı sayıyor.
- 10k/50k socket, publish fan-out, heartbeat ve dashboard liste yük testi yok.
- Dependency audit, SAST, secret scanning, container scan ve SBOM adımı yok.

## Güçlü taraflar

- Tenant filtrelerini merkezileştirmeye yönelik `buildDeviceFilter`/`buildMediaFilter` yaklaşımı doğru yönde.
- Android içerik indirmesinde checksum doğrulaması, retry ve offline cache bulunuyor.
- Telemetry için 30 günlük TTL ve cihaz/kind/zaman compound indexi tanımlı.
- Komut ID ve `(tenantId, deviceId, commandId)` unique indexi idempotency için iyi bir temel.
- Pairing endpointinde rate limiting ve kısa ömürlü pairing code mevcut.
- Dashboard tokenı HttpOnly cookie içinde tutuluyor.
- Backend test paketi mevcut durumda 56 testi başarıyla geçiriyor.
- Operasyon, migration, canary ve incident dokümanları kapsamlı; uygulama ile doküman arasındaki boşluk kapatılırsa değerli bir temel olur.

## 10.000+ ekran için önerilen hedef mimari

1. **Device gateway katmanı:** Stateless Socket.IO/MQTT gateway, cihaz JWT/mTLS, Redis adapter, connection lease ve backpressure.
2. **Control API:** Tenant/RBAC doğrulaması, idempotent bulk-job API, audit ve desired state yazımı.
3. **Durable command bus:** Redis Streams/NATS/Kafka/RabbitMQ; partition key `deviceId`, DLQ ve retry policy.
4. **Dispatch workers:** Cihaz presence kontrolü, komut teslimi, ACK correlation ve reconnect replay.
5. **Telemetry pipeline:** Gateway'den doğrudan kuyruğa; worker ile batch/time-series storage, downsampling ve retention.
6. **Primary data store:** Tek system of record. Geçiş sürecinde outbox + reconciliation; rastgele kullanıcı bazlı shadow read yerine kontrollü tenant cohort.
7. **Object storage/CDN:** İmzalı URL, resumable upload, scan/transcode, lifecycle ve tenant kotası.
8. **Dashboard read model:** Cursor pagination, precomputed fleet summaries, event delta ve virtualized table.

## Önerilen uygulama planı

### Aşama 0 — Acil güvenlik, 24–72 saat

1. Public RSS proxy'yi kapatın veya güvenli allowlist uygulayın.
2. Device socket authentication eklenene kadar internet erişimini güvenilir ağ/VPN ile sınırlandırın.
3. HTTP fallback'i production build'den kaldırın.
4. `test_token.txt` tokenını rotate edin; tenant uploadlarını Git'ten ve gerekiyorsa geçmişten temizleyin.
5. Backend TypeScript hatalarını düzeltin ve kırık build'i kapatın.
6. Login rate limit, güvenli CORS allowlist ve temel security header'ları ekleyin.

### Aşama 1 — Dağıtık kontrol düzlemi, 1–2 hafta

1. Cihaz başına credential + Keystore/mTLS veya cihaz JWT akışını kurun.
2. Socket Redis adapter ve durable command queue ekleyin.
3. Komut state machine, startup recovery, reconnect replay ve cihaz idempotency ekleyin.
4. Presence'i TTL/lease tabanlı yapın; global offline reset'i kaldırın.
5. Pairing'i atomik hale getirin ve bootstrap key yetkisini daraltın.

### Aşama 2 — Veri ve içerik ölçeği, 2–4 hafta

1. Object storage/CDN ve signed URL geçişini tamamlayın.
2. Bütün liste endpointlerini cursor pagination ve limitlerle değiştirin.
3. Dashboard'u virtualized server-side tabloya geçirin.
4. Bulk job API, selection token ve progress ekranını ekleyin.
5. Heartbeat/telemetry'yi gerçek batch pipeline'a taşıyın.
6. Desired/reported state ve config version drift modelini ekleyin.

### Aşama 3 — Üretim dayanıklılığı, 4–8 hafta

1. 10k, sonra 50k eşzamanlı cihaz yük testleri.
2. Reconnect storm, node loss, Redis failover, DB latency ve deploy sırasında command-loss testleri.
3. OTA staged rollout, canary, rollback ve version compliance.
4. Merkezi Prometheus/OpenTelemetry metrikleri, log aggregation ve alerting.
5. Dashboard E2E, socket security ve Android instrumented testlerini CI release gate yapın.

## Üretim kabul kriterleri

Aşağıdaki değerler başlangıç SLO önerisidir; iş gereksinimine göre kesinleştirilmelidir:

- 10.000 eşzamanlı cihaz bağlantısı altında gateway CPU/memory güvenli sınırlar içinde.
- Node restart veya rolling deploy sırasında kabul edilmiş komut kaybı: **0**.
- Online cihaza komut teslim p95: **<2 saniye**; tamamlanma cihaz komutuna göre ayrı ölçülmeli.
- Komut teslim/ACK başarı oranı: **≥%99,9**; offline cihazlar ayrı sınıflandırılmalı.
- Presence yanlış-online p99 süresi: heartbeat aralığının en fazla 2–3 katı.
- Dashboard ilk sayfa p95: **<500 ms**, payload sabit ve cihaz toplamından bağımsız.
- Bulk job 10.000 cihazda API request timeout'una bağlı olmadan arka planda ilerlemeli.
- Cross-tenant erişim testleri: **0 ihlal**; REST, socket, object URL ve job sonuçlarını kapsamalı.
- Reconnect storm: filonun %20'si 5 dakika içinde döndüğünde sistem kontrollü jitter/backpressure ile toparlanmalı.
- Medya indirme checksum doğrulaması ve imzalı manifest olmadan “aktif” kabul edilmemeli.
- Release gate: backend/dashboard/Android build, test, lint, secret scan ve kritik güvenlik testlerinin tamamı geçmeli.

## Sonuç

Projenin problem alanı doğru anlaşılmış ve özellikle Android offline playback ile operasyon dokümantasyonunda önemli çalışma yapılmış. Bununla birlikte mevcut yapı hâlâ tek sunucu/az cihaz varsayımına bağlı. En doğru sonraki yatırım yeni dashboard özelliklerinden önce cihaz kimliği, durable command bus, dağıtık socket presence ve object storage temelini kurmaktır. Bu dört temel tamamlanmadan ekran sayısını büyütmek güvenlik açıklarını ve operasyonel belirsizliği doğrusal değil, katlanarak büyütür.
