# Android Uptime Sertleştirme Raporu

Tarih: 24 Temmuz 2026
Kapsam: `android-player`
Hedef: Binlerce uzaktan yönetilen ekranda elektrik/internet kesintilerine dayanıklı, tekrar eden komutları güvenli işleyen ve yerel içeriği kesintisiz oynatan Android istemcisi.

## Sonuç

Android istemcide yüksek etkili yaşam döngüsü, servis yeniden doğma, ağ toparlanma, içerik aktivasyonu, oynatma watchdog'u, komut ACK'i, ekran kapatma ve kritik yerel kayıt sorunları düzeltildi. Debug APK, unit test ve Android lint kalite kapıları başarıyla geçti.

Kod tarafı üretim hazırlığı tamamlandı. Bununla birlikte Android 15 ve OEM güç yönetimi nedeniyle "elektrik gelir gelmez yüzde 100 görünür uygulama" garantisi yalnız APK koduyla verilemez; cihazların Dedicated Device / Device Owner olarak hazırlanması, uygulamanın varsayılan Home uygulaması seçilmesi ve lock-task allowlist'e alınması gerekir.

## Tamamlanan checklist

- [x] Activity yeniden oluşturulunca process-scope ExoPlayer'ın yanlışlıkla release edilmesi kaldırıldı.
- [x] Foreground service sistem tarafından tek başına yeniden oluşturulduğunda tüm runtime graph'ın kurulması sağlandı.
- [x] Servisin kendisini sonsuz yeniden başlatma döngüsüne sokması engellendi.
- [x] Task kaldırıldığında alarm tabanlı watchdog ve görünür UI geri getirme eklendi.
- [x] BOOT_COMPLETED, USER_UNLOCKED, MY_PACKAGE_REPLACED ve üretici quick-boot akışları ele alındı.
- [x] Android 15'te BOOT_COMPLETED içinden `mediaPlayback` foreground service başlatma yasağına uygun koşullu başlangıç eklendi.
- [x] Uygulama Home/launcher ve DPC allowlist lock-task kurulumuna hazırlandı.
- [x] İnternet geri geldiğinde 5 dakikalık backoff beklenmeden session ve socket uyandırılıyor.
- [x] Socket reconnect sonsuz, jitter'lı ve token yenilemesine bağlı çalışıyor.
- [x] Aynı komutun eşzamanlı tekrar çalıştırılması in-flight command set ile engellendi.
- [x] Komut sonuçları sunucu kabul edene kadar diskte tutuluyor ve heartbeat sırasında tekrar gönderiliyor.
- [x] Kritik pairing, device proof ve ACK kayıtları elektrik kesintisine karşı senkron diske yazılıyor.
- [x] Komut timeout'u uygulanıyor; başarısız screenshot artık sahte yerel URL ile başarılı sayılmıyor.
- [x] REBOOT_APP komutu ACK kaydından sonra alarm watchdog ile kontrollü yeniden başlıyor.
- [x] CLEAR_CACHE/FORCE_REFRESH sonrasında sunucunun authoritative içeriği yeniden göndermesi için socket refresh eklendi.
- [x] Aynı anda gelen SYNC_CONTENT mesajları mutex ile seri hale getirildi.
- [x] İçerik sync sürüm/checksum bilgisi reboot sonrasında da korunuyor.
- [x] Eksik dosya varsa checksum eşleşse bile sync'in yanlışlıkla atlanması engellendi.
- [x] Staging -> active geçişinde ATOMIC_MOVE desteklenmeyen Android dosya sistemleri için güvenli fallback eklendi.
- [x] Elektrik kesintisi active/backup geçişinin ortasında olursa Room kayıtlarıyla doğrulayıp rollback/recovery yapılıyor.
- [x] Room commit sonrasındaki metadata/quota hatasının dosyaları eski sürüme döndürerek DB'yi bozması engellendi.
- [x] Dosya adı path traversal'a karşı sanitize ediliyor; tek medya ve boş disk rezervi sınırları uygulanıyor.
- [x] Bozuk/yarım indirmeler aktif playlist'i değiştirmiyor.
- [x] Playback state yalnız ilk öğede bir kez uygulanıyor; her turda eski pozisyona dönme bug'ı giderildi.
- [x] Playback loop hata sonrası kalıcı olarak ölmek yerine backoff ile yeniden kuruluyor.
- [x] Decoder pozisyonu 60 saniye ilerlemezse telemetri + sonraki öğeye geçiş uygulanıyor.
- [x] Geçerli uzun videoları 30 dakikada zorla kesen yanlış watchdog kaldırıldı.
- [x] SCREEN_OFF/çalışma saati kapalıyken video ve ses gerçekten pause oluyor; açılınca kaldığı yerden devam ediyor.
- [x] Gece yarısını geçen çalışma saatleri (22:00-06:00) düzeltildi ve unit test eklendi.
- [x] Static image/web içerikte ekran uykusu engellendi; WebView offline cache fallback eklendi.
- [x] ImageView aynı dosyayı her recomposition'da yeniden decode etmiyor.
- [x] Screenshot bitmap ve Activity provider yarışları giderildi.
- [x] Room açıkça WAL moduna alındı.
- [x] Tekrarlayan telemetri olayları cihaz başına/kaynak başına 5 dakika sınırlandı.
- [x] Lint hataları sıfırlandı; debug APK ve unit testler geçti.

## Kesinti senaryoları

| Senaryo | Beklenen davranış |
|---|---|
| İnternet gider, elektrik var | Yerel playlist kesintisiz oynar; pairing ekranına düşmez; socket/session jitter'lı retry yapar. |
| İnternet geri gelir | Connectivity callback session ve socket'i anında uyandırır; sunucu mevcut playlist'i tekrar yollar; aynı checksum ve sağlam cache ise indirme yapılmaz. |
| Elektrik indirme sırasında gider | Staging aktif edilmez; önceki active playlist ve Room kayıtları korunur. Eski staging 24 saat sonra temizlenir. |
| Elektrik active klasör değişimi sırasında gider | Açılış recovery'si active/backup ve Room yollarını karşılaştırır; yarım geçiş rollback edilir. |
| Elektrik Room commit sonrasında gider | Yeni active dosyalar Room ile eşleşir; backup temizlenir ve yeni playlist devam eder. |
| Activity sistem tarafından yeniden oluşturulur | Process-scope ExoPlayer release edilmez; yeni PlayerView aynı oynatıcıya bağlanır. |
| Process RAM baskısıyla öldürülür | START_STICKY service runtime graph'ı yeniden kurar, cache + playback pozisyonu geri yüklenir. |
| Task recent ekranından kaldırılır | Watchdog alarm service/runtime'ı ve izin verildiğinde UI'yi geri getirir. |
| Aynı komut iki kez gelir | İlk komut çalışırken ikinci kopya çalıştırılmaz; tamamlanmışse durable ACK yeniden gönderilir. |
| ACK paketi kaybolur | ACK diskte kalır; reconnect ve heartbeat'lerde backend kabul edene kadar yeniden gönderilir. |
| Video decoder donar | 60 saniye ilerlemeyen video raporlanır ve playlist sonraki öğeden devam eder. |
| Çalışma saati gece yarısını geçer | 22:00-06:00 gibi aralıklar doğru değerlendirilir; ekran kapalıyken video/ses pause olur. |

## Ölçek davranışı

- Session retry tam jitter ile 5 dakikaya kadar yayılır; internet geri dönüş sinyali beklemeyi kesebilir.
- Socket reconnect 1-30 saniye aralığında Socket.IO backoff kullanır.
- Heartbeat 60 saniye etrafında +/-5 saniye jitter içerir; 10.000 cihazın aynı saniyede yük oluşturması önlenir.
- İçerik indirmeleri cihaz içinde bilinçli olarak seri tutuldu; düşük donanımda disk/decoder baskısı ve sunucuda eşzamanlı bağlantı patlaması azaltıldı.
- Telemetri aynı hata kaynağı için beş dakikada bir raporlanır.
- Sync dedup bilgisi kalıcıdır; reboot veya socket reconnect aynı playlist'i yeniden indirmez.

## Doğrulama

- `:app:testDebugUnitTest`: başarılı
- `:app:assembleDebug`: başarılı
- `:app:lintDebug`: başarılı, 0 error
- Üretilen APK: `android-player/app/build/outputs/apk/debug/app-debug.apk`
- Lint HTML: `android-player/app/build/reports/lint-results-debug.html`

Lint'te kalan advisory uyarılar ağırlıklı olarak bağımlılık sürümleri, version catalog önerileri, debug CA/cleartext yapılandırması, kiosk için sabit landscape tercihi ve kontrollü WebView JavaScript kullanımına aittir; kalite kapısını durduran hata yoktur.

## Sahada zorunlu kurulum checklist'i

Aşağıdakiler tamamlanmadan Android/OEM seviyesinde yüzde 100 auto-start garantisi verilmemelidir:

- [ ] Hedef cihazı Fully Managed / Device Owner olarak provision et.
- [ ] `com.signage.player` paketini varsayılan kalıcı Home uygulaması yap.
- [ ] Paketi DPC `setLockTaskPackages` allowlist'ine ekle; manifest `if_whitelisted` hazır.
- [ ] OEM battery manager içinde uygulamayı Unrestricted / Never sleep yap.
- [ ] Otomatik başlatma iznini üretici ayarlarında aç.
- [ ] Ekran kilidi/PIN'i kaldır veya kurumsal DPC ile açılış politikasını yönet.
- [ ] Gerçek hedef modellerde priz çekme, router kapatma, 24/72 saat soak ve 100 tekrar boot testi yap.
- [ ] 1.000/10.000 sanal cihazla publish, reconnect ve backend medya yük testi yap; mümkünse medyayı CDN/object storage üzerinden dağıt.
- [ ] Release `local.properties` içinde HTTPS backend ve en az 32 karakter bootstrap key yapılandır; imzalı release APK/AAB doğrula.

## Android platform notu

Android 15 / targetSdk 35, `BOOT_COMPLETED` receiver içinden `mediaPlayback` foreground service başlatılmasını yasaklar. Kod API 35'te bu yasaklı çağrıyı yapmıyor; görünür Activity/Home akışı üzerinden servisi başlatıyor. Kesin boot görünürlüğü için uygulamanın Dedicated Device üzerinde varsayılan Home uygulaması yapılması gerekir.

Kaynaklar:

- https://developer.android.com/about/versions/15/changes/foreground-service-types
- https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode
- https://developer.android.com/work/dpc/dedicated-devices/cookbook
- https://developer.android.com/topic/performance/background-optimization