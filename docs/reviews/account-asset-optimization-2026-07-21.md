# Hesap, Kullanıcı, Ekran ve Medya Yönetimi Optimizasyon Raporu

Tarih: 21 Temmuz 2026  
Kapsam: Hesap/tenant oluşturma, kullanıcı yönetimi, rol ve yetki sınırları, ekran sahipliği, medya ve klasör yaşam döngüsü, binlerce cihaz için sorgu ve bağlantı ölçekleme

## Sonuç

Hesap, kullanıcı, ekran ve medya yönetimi tenant sınırları etrafında yeniden güvenli hale getirildi. Kullanıcı silme gibi veri kaybına ve sahipsiz içeriğe yol açabilecek işlemler pasifleştirme ve sahiplik aktarımı modeline çevrildi. Ekran kaldırma işlemi donanım kimliğini silmeden güvenli biçimde eşleşmeyi kaldırıyor. Liste ve arama akışları sınırsız veri çekmek yerine indeksli, sayfalı ve projection kullanan sorgularla çalışıyor.

Sistem, tek backend düğümü varsayımından çıkarılarak tenant kapatma ve socket sonlandırma işlemlerinde Socket.IO adapter odalarını kullanacak şekilde güncellendi. Böylece aynı tenant'a ait cihaz ve dashboard oturumları farklı backend düğümlerinde olsa bile kapatılabiliyor.

## Uygulanan geliştirmeler

### 1. Hesap oluşturma ve kimlik güvenliği

- E-posta, görünen ad ve tenant adı merkezi kurallarla normalize ediliyor.
- Parolalar 12-128 karakter aralığında ve küçük harf, büyük harf, sayı, sembol gruplarından en az üçünü içerecek şekilde doğrulanıyor.
- API üzerinden yalnızca tenant rolleri oluşturulabiliyor; `super_admin` rolünün tenant kullanıcı endpointinden enjekte edilmesi engellendi.
- İlk aktif tenant kullanıcısının `tenant_owner` olması zorunlu hale getirildi.
- Aynı tenant adı büyük/küçük harf farkıyla yeniden oluşturulamıyor.
- Login hata mesajları kullanıcı varlığını ele vermeyecek biçimde birleştirildi; pasif kullanıcı ve pasif tenant girişleri engellendi.
- Kimlik yanıtlarına `Cache-Control: no-store` eklendi.

### 2. Kullanıcı ve rol yönetimi

- Kullanıcı listeleri sayfalı, aranabilir ve rol/durum filtreli hale getirildi; üst limit 200 kayıt.
- Tenant yöneticisi yalnızca `operator` ve `viewer` oluşturabilir; owner/admin hesaplarını düzenleyemez veya yetki yükseltemez.
- Kullanıcının kendisini kilitlemesi ve tenant'ın son aktif sahibinin pasifleştirilmesi engellendi.
- E-posta, parola, rol veya aktiflik değiştiğinde mevcut dashboard socket oturumları kapatılıyor; eski yetkinin açık bağlantıda yaşamaya devam etmesi önlendi.
- Kullanıcı silme kalıcı silme yerine soft-deactivation olarak uygulanıyor. İşlem zamanı ve işlemi yapan kullanıcı kaydediliyor.
- Normal kullanıcı güncelleme endpointinden sahiplik aktarımı olmadan pasifleştirme engellendi; bütün pasifleştirmeler güvenli aktarım akışına zorlanıyor.
- Pasifleştirilen kullanıcıya ait ekranlar, medyalar, playlistler ve klasörler seçilen aktif kullanıcıya; seçim yoksa en eski aktif tenant sahibine aktarılıyor.
- Aynı isimli klasörler aktarım sırasında güvenli biçimde birleştiriliyor.
- MongoDB ana kayıt kaynağı olarak korunurken PostgreSQL gölge kayıtları da senkronize ediliyor.

### 3. Tenant yaşam döngüsü

- Super Admin ekranından tenant adı ve aktiflik durumu yönetilebiliyor.
- Tenant pasifleştirildiğinde cihazlar offline işaretleniyor ve o tenant'a ait cihaz/dashboard socketleri bütün backend düğümlerinde kapatılıyor.
- HTTP ve socket kimlik doğrulaması tenant aktifliğini kontrol ediyor.
- Tenant aktiflik sorgusu 30 saniyelik, 10.000 kayıtla sınırlandırılmış bellek önbelleği kullanıyor; güncellemede ilgili kayıt geçersizleştiriliyor.
- Tenant listesi, kullanıcı/cihaz/medya sayılarını sayfa başına toplu aggregate sorgularıyla getiriyor; N+1 sorgu kaldırıldı.

### 4. Ekran sahipliği ve yeniden eşleştirme

- Ekran kaldırma donanım kaydını silmiyor; tenant, sahip, erişim kanıtı ve aktif playlist bağlantısını temizleyerek cihazı eşleşmemiş duruma getiriyor.
- Kaldırılan ekrana ait bekleyen/gönderilmiş/onay bekleyen komutlar başarısız duruma çekiliyor.
- Cihaz socketi cluster genelinde kapatılıyor ve PostgreSQL gölge kaydı güncelleniyor.
- Yeniden eşleşen donanıma önceki tenant'ın kuyruktaki komutlarının gönderilmemesi için komut replay sorguları `deviceId + tenantId` ile sınırlandı.
- Tenant owner ve admin tenant genelindeki ekranları yönetebilir; operator yalnızca kendisine atanmış varlıkları görür.

### 5. Medya ve klasör optimizasyonu

- Medya listesi MongoDB üzerinden sayfalı, projection kullanan, count ve data sorgularını paralel çalıştıran yapıya dönüştürüldü.
- Arama indeks dostu prefix araması olarak uygulandı; klasör ve sahiplik filtreleri sorguya dahil edildi.
- MIME beyaz listesi eklendi: JPEG, PNG, WebP, GIF, MP4, WebM ve QuickTime. HTML/metin ve desteklenmeyen içerikler reddediliyor.
- Dosya adları güvenli basename'e dönüştürülüyor ve uzunluk sınırı uygulanıyor.
- Dosyalar stream üzerinden SHA-256 ile kontrol ediliyor. Aynı kullanıcının aynı içeriği yeniden yüklemesi ikinci fiziksel dosya ve kayıt üretmiyor.
- Yükleme sonrasındaki DB hatalarında geçici ve taşınmış dosyalar temizlenerek orphan dosya oluşumu önleniyor.
- Klasör listeleme `distinct/group` aggregate ile, yeniden adlandırma ve silme `updateMany` ile yapılıyor; medya başına döngüsel yazma kaldırıldı.
- PostgreSQL klasör güncellemeleri de kayıt başına upsert yerine tek toplu SQL update kullanıyor.
- Tenant owner/admin tenant genelindeki medyayı; operator yalnızca kendi medyasını görebiliyor.

### 6. Dashboard iyileştirmeleri

- Kullanıcı, tenant, cihaz ve medya ekranlarına sunucu taraflı arama ve sayfalama eklendi.
- Arama girdileri debounce ile çalışıyor; her tuşta kontrolsüz istek üretilmiyor.
- Toplam kayıt ve sayfa bilgileri backend sonuçlarından gösteriliyor.
- Güçlü parola kuralları form tarafında da uygulanıyor.
- Tenant pasifleştirme/aktifleştirme Super Admin arayüzüne eklendi.
- Medya tekilleştirme sonucu arayüzde ikinci kopya olarak gösterilmiyor.

## Ölçek ve algoritma etkisi

- Sınırsız hesap/ekran/medya listeleri kaldırıldı; sorgular varsayılan 50 ve en fazla 200 kayıt döndürüyor.
- Tenant istatistikleri her tenant için ayrı sorgu yerine sayfa başına birkaç toplu aggregate sorgusuyla hesaplanıyor.
- `tenantId`, `ownerUserId`, `status`, `role`, `folder`, `checksum`, `createdAt` ve `updatedAt` bileşik indeksleri eklendi.
- Klasör taşıma ve yeniden adlandırma maliyeti N adet belge için N ağ turundan tek `updateMany` işlemine indirildi.
- Medya checksum tekilleştirmesi depolama kullanımını ve aynı içeriğin tekrar işlenmesini azaltıyor.
- Tenant socket odaları, binlerce bağlantının tek tek süreç belleğinden aranması yerine adapter üzerinden toplu sonlandırma sağlıyor.
- Komut replay tenant kapsamına alınarak cihaz yeniden kullanımı sırasında veri/yetki sızıntısı engelleniyor.

## Veritabanı ve üretim geçişi

Üretime çıkmadan önce yedek alınmalı ve staging ortamında aşağıdaki geçişler çalıştırılmalıdır:

```powershell
npm run db:migrate:pg -w backend
npm run db:migrate:accounts -w backend
```

- PostgreSQL migration: `backend/db/migrations/005_account_asset_optimization.sql`
- Mongo hesap/sahiplik ve indeks geçişi: `backend/src/scripts/migrate-account-ownership.ts`
- Production ortamında `MONGO_AUTO_INDEX=false` ise Mongo geçiş komutu zorunludur.
- Mongo geçişi duplicate tenant adlarını önce raporlar; çakışmalar çözülmeden unique `nameKey` uygulanmamalıdır.
- Kullanıcı yaşam döngüsünde MongoDB ana kayıt kaynağıdır. PostgreSQL senkronizasyon hataları loglanır ve ana işlemi yanlış biçimde başarısız göstermez.

## Doğrulama sonucu

- Backend TypeScript kontrolü: başarılı.
- Dashboard TypeScript kontrolü: başarılı.
- Backend testleri: 70/70 başarılı.
- Dashboard testleri: 5/5 başarılı.
- Toplam otomatik test: 75/75 başarılı.
- Backend production build: başarılı.
- Next.js 15.5.20 production build: başarılı, 42 sayfa/API route üretildi.
- `git diff --check`: başarılı.
- Production NPM audit: 0 açık güvenlik bulgusu.

## Üretimde ayrıca yapılması gereken kapasite doğrulaması

Kod seviyesi hesap ve varlık yönetimi sorunları giderildi. Gerçek kapasite garantisi için production benzeri Mongo replica set, PostgreSQL, Redis adapter, load balancer ve nesne depolama ortamında 10.000-50.000 cihazla aşağıdaki testler ayrıca çalıştırılmalıdır:

- Aynı anda login ve socket reconnect dalgası.
- Tenant pasifleştirme sırasında farklı backend düğümlerindeki bağlantıların kapanması.
- Yüksek hacimli medya listeleme/yükleme ve checksum çakışması.
- Büyük tenant'ta kullanıcı pasifleştirme ve yüz binlerce varlığın sahiplik aktarımı.
- Mongo/PG geçici kesintisinde sahiplik senkronizasyonunun yeniden uzlaştırılması.
- Redis failover ve rolling deployment sırasında komut/ACK teslimi.

Çok büyük hesaplarda kullanıcı varlık aktarımı için mevcut idempotent toplu güncellemelerin kuyruk tabanlı arka plan işe taşınması bir sonraki ölçek adımıdır. Mongo replica set kullanılan kurulumlarda bu akış transaction ile daha da sıkı atomik hale getirilebilir.
