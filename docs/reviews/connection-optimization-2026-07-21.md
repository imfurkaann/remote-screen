# Cihaz–Backend–Dashboard Bağlantı Optimizasyonu

Tarih: 21 Temmuz 2026  
Hedef: 10.000+ eşzamanlı Android ekran, çoklu backend node ve canlı dashboard

## Sonuç

Cihaz oturumu, Socket.IO bağlantısı, heartbeat, komut teslimi, ACK, dashboard canlı durum ve playlist fan-out akışları tek bir doğrulanmış cihaz kimliği etrafında birleştirildi. Çevrimdışı cihazlarda komut kaybına, kısa ağ geçişlerinde hatalı offline görünümüne, token yenileme fırtınasına ve cihaz başına tekrarlanan Redis yayınına yol açan yollar giderildi.

## Nihai bağlantı akışı

1. Android kurulum bazlı cihaz kanıtı ve hardware ID ile session endpointine bağlanır.
2. Backend eşleşmiş Mongo cihazını doğrular ve 48 saatlik cihaz JWT'si üretir.
3. Android `/device` namespace'ine JWT ile bağlanır; backend oda kimliğini yalnız token ve DB kaydından üretir.
4. Cihaz 60 saniye ±5 saniye jitter ile heartbeat gönderir. Backend son durumu bellekte birleştirip tek `bulkWrite` ile yazar.
5. Dashboard HttpOnly kullanıcı oturumuyla 5 dakikalık, yalnız socket bağlantısında kullanılabilen bir ticket alır.
6. Dashboard `/dashboard` namespace'inde tenant/kullanıcı odasına katılır ve `DEVICE_STATUS` ile `COMMAND_ACK` olaylarını canlı alır.
7. Komut yalnız cihaz odasında aktif bağlantı varsa `sent` durumuna geçirilir. Çevrimdışıysa `queued` kalır ve reconnect sırasında gönderilir.
8. Android komut sonucunu yerel kalıcı kuyrukta tutar. Backend Mongo'ya yazdığını callback ile onaylayınca yerel ACK silinir.

## Düzeltilen önemli hatalar

- Dashboard'ın 5 saniyelik sürekli detay polling'i canlı socket + 30 saniyelik görünür-sekme fallback akışına çevrildi.
- Liste polling'i 30 saniyeden 60 saniyeye indirildi; durum geçişleri socket üzerinden anlık işleniyor.
- Dashboard access tokenı JavaScript'e açılmadan kısa ömürlü `dashboard_socket` bileti eklendi.
- Dashboard socket üzerinden kalıcı kayıt oluşturmadan doğrudan komut/sync gönderen yollar kaldırıldı.
- Unpair işlemi aktif cihaz socketlerini bütün backend node'larında kapatıyor.
- Disconnect anında offline yazma kaldırıldı; 45 saniyelik reconnect toleransı eklendi.
- Backend çökmesi veya kayıp disconnect olayları için 60 saniyelik stale-status sweeper eklendi.
- Android token değişiminde socket güvenli biçimde yeniden kuruluyor; yalnız authentication reddi anlık session refresh tetikliyor.
- Telemetry'nin ikinci ve bağımsız token yenileme döngüsü kaldırıldı; socket, screenshot ve telemetry tek SessionManager kimliğini kullanıyor.
- Komut ACK'leri sunucu yazma onayı alınana kadar Android SharedPreferences içinde kalıcı tutuluyor.
- Tekrarlanan komut, bekleyen ACK varsa yeniden çalıştırılmadan ACK yeniden gönderilerek idempotent davranıyor.
- Çevrimdışı cihaz komutları deneme hakkını tüketmiyor; 24 saatten eski eylemler güvenli biçimde expire ediliyor.
- Komut oluşturmadaki unique-index yarışı ve aynı komutun eşzamanlı iki kez `sent` yapılması engellendi.
- Playlist publish aynı payloadı her cihaz için iki kez yayınlamak yerine canonical DB-ID odalarına tek adapter fan-out kullanıyor.
- 20.000 cihazlık tek publish üst sınırı ve device ID deduplication eklendi.
- Mongo cihaz listesinde projection, paralel count/data sorgusu ve bağlantı yolu indeksleri eklendi.
- Mongo havuzu production için ayarlanabilir hale getirildi; varsayılan max 100/min 5 bağlantı.
- Socket.IO/Engine.IO/ws, Next.js ve PostCSS güvenli sürümlere yükseltildi.

## Ölçek etkisi

- Heartbeat sıklığı 10.000 cihazda yaklaşık 333 olay/sn seviyesinden ortalama 167 olay/sn seviyesine iner; jitter aynı saniyeye yığılmayı önler.
- Mongo heartbeat yazımları istek başına ayrı round-trip yerine 15 saniyelik toplu `bulkWrite` kullanır.
- 10.000 hedefli playlist publish, 20.000 ayrı hardware/DB oda yayını yerine tek adapter yayını oluşturur.
- Dashboard ayrıntı ekranı normal durumda dakikada 12 yerine 2 HTTP yenilemesi yapar; komut ve bağlantı sonucu socketten anlık gelir.
- Reconnect komut replay'i komut başına Redis presence sorgusu çalıştırmaz; bağlantının zaten doğrulandığı bilgisi kullanılır.

## Veritabanı ve dağıtım ayarları

- `REDIS_URL`: production çoklu-node Socket.IO için zorunlu.
- `NEXT_PUBLIC_BACKEND_SOCKET_URL`: tarayıcının ulaşabildiği HTTPS/WSS backend origin'i.
- `MONGO_MAX_POOL_SIZE`: varsayılan 100.
- `MONGO_MIN_POOL_SIZE`: varsayılan 5.
- `MONGO_AUTO_INDEX`: development'ta true; production'da false ve indeksler deployment migration ile oluşturulmalı.
- Load balancer WebSocket upgrade desteklemeli. Mevcut istemciler polling fallback kullanabildiği için çoklu backend node dağıtımında cookie/IP tabanlı sticky session zorunludur; yalnız WebSocket transportuna geçilirse bu gereksinim kaldırılabilir.

## Doğrulama

- Backend testleri: 61/61.
- Dashboard testleri: 5/5.
- 10.000 canonical oda deduplication/fan-out testi başarılı.
- Backend ve dashboard TypeScript kontrolü başarılı.
- Backend production build başarılı.
- Next.js 15.5.20 production build başarılı, 42 route.
- Android unit test ve debug APK build başarılı.
- Production NPM audit: 0 açık.

## Üretim öncesi kalan doğrulamalar

Kod seviyesi bağlantı problemleri giderildi. Gerçek kapasite garantisi için production benzeri Redis cluster, Mongo replica set, load balancer ve ağ gecikmesi altında 10.000–50.000 cihazla reconnect storm, heartbeat burst, komut ACK kaybı, Redis node failover ve rolling deployment testleri ayrıca çalıştırılmalıdır. Kalıcı komut sistemi için tam outbox/stream ve DLQ mimarisi halen önerilen bir sonraki altyapı adımıdır.