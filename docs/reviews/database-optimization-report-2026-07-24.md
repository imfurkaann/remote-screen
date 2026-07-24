# Veritabanı Optimizasyon ve Sertleştirme Raporu

Tarih: 24 Temmuz 2026

## Sonuç

MongoDB ana veri kaynağı ve PostgreSQL shadow-read yapısı; şema, indeks, bağlantı havuzu, migration, retry, yarış koşulları, tenant izolasyonu, sorgu sınırları, veri bütünlüğü ve bakım süreçleri açısından baştan sona incelendi. Kod tarafındaki tespitler giderildi. Canlı veritabanına bağlanılmadı ve canlı veri üzerinde değişiklik yapılmadı.

Önemli sonuçlar:

- PostgreSQL partial unique indeksleriyle uyumsuz `ON CONFLICT` sorguları düzeltildi.
- Mongo ObjectId → PostgreSQL UUID dönüşümü ortak, doğrulanan ve deterministik hale getirildi.
- Cihaz shadow kaydı read-then-write yerine atomik upsert oldu.
- Migration runner checksum, advisory lock, dosya başına transaction ve online indeks desteği kazandı.
- MongoDB/PostgreSQL pool ve timeout ayarları üretim yüküne uygun ve yapılandırılabilir hale getirildi.
- Yalnızca geçici veritabanı/ağ hataları retry ediliyor; constraint hataları tekrar denenmiyor.
- Circuit breaker HALF_OPEN durumunda tek kurtarma probe'u çalıştırıyor.
- Aynı cihaz için birden fazla aktif pairing kodu üretme yarışı unique partial indeks ve yarış güvenli route akışıyla kapatıldı.
- Komut shadow yazımındaki mükerrer PostgreSQL çağrısı kaldırıldı; `requestedByUserId` eşlemesi tamamlandı.
- Başlangıçtaki komut kurtarma N+1 save döngüsü `bulkWrite` ve sınırlı paralel shadow senkronizasyonuna dönüştürüldü.
- Model doğrulamaları, sorgu limitleri ve ObjectId kontrolleri genişletildi.
- Üretimde yanlışlıkla veri silebilen seed/clear scriptleri çift onay ve production kilidi aldı.
- Dry-run bütünlük denetimi, kontrollü indeks migration'ı, batch retention, constraint validation ve PostgreSQL shadow repair araçları eklendi.

## Düzeltilen kritik hatalar

### PostgreSQL upsert ve kimlik eşleme

`media`, `playlists` ve `commands` upsert sorguları, bağlı oldukları soft-delete partial unique indeks predicate'lerini artık `ON CONFLICT` içinde açıkça belirtiyor. Bu değişiklik PostgreSQL'in doğru arbiter indeksi bulamaması nedeniyle oluşan çalışma zamanı hatasını giderir.

Cihaz sahibinin MongoDB ObjectId değeri artık doğrudan UUID kolona gönderilmiyor. Geçersiz kimlikler sessizce sıfır UUID'ye çevrilmek yerine reddediliyor.

### Migration güvenliği

Yeni runner:

- Aynı anda iki deploy'un migration çalıştırmasını advisory lock ile engeller.
- Uygulanmış dosyanın sonradan değiştirilmesini SHA-256 checksum ile tespit eder.
- SQL fonksiyonlarını bozan noktalı virgül bölme yöntemini kullanmaz.
- Her normal migration'ı ayrı transaction içinde çalıştırır.
- `-- migrate:no-transaction` başlıklı, tek statement'lı migration'larda `CREATE INDEX CONCURRENTLY` kullanımını destekler.
- Başarısız migration sonrası lock ve bağlantıyı güvenli şekilde bırakır.

`007_database_integrity_hardening.sql` Mongo/PostgreSQL benzersizlik kurallarını hizalar, eksik alanları ve CHECK/FK kurallarını ekler. Mevcut kirli veriyi migration anında zorla reddetmemek için yeni constraintler `NOT VALID` eklenir; yeni yazımlar korunur, eski verinin validasyonu ayrı kontrollü adımda yapılır.

`008_commands_retention_index.sql` komut retention taramasının büyük tabloda yazımları uzun süre bloklamaması için online indeks oluşturur.

### Pairing ve eşzamanlılık

Aynı cihaz için yalnızca bir tüketilmemiş pairing kodu ve sistem genelinde yalnızca bir aktif kod değeri bulunabilir. Migration öncesi duplicate grupları raporlanır. İsteğe bağlı repair yalnızca en yeni aktif kodu tutup eski aktif kodları tüketilmiş olarak işaretler.

### Sorgu ve filo ölçekleme

- Repository limitleri içeride de 1–100/200 aralığına sabitlendi.
- Playlist yayın hedefi 20.000 cihazla sınırlandı ve batch/fan-out akışı korunuyor.
- Komut kurtarma en fazla 10.000 kayıt okuyor; tek tek save yerine unordered bulk update kullanıyor.
- Shadow repair 250 kayıtlık cursor batch'leri ve 25 eşzamanlı işlem sınırı kullanıyor.
- Retention silmeleri MongoDB ve PostgreSQL'de 1.000 kayıtlık batch'lerle ilerliyor.
- Liste sorgularında tenant/sahiplik predicate'leri ve uygun bileşik indeksler birlikte kullanılıyor.

## Yeni bakım komutları

Komutların varsayılan davranışı mutasyon yapmamaktır:

```text
npm run db:check:integrity -w backend
npm run db:migrate:hardening -w backend
npm run db:maintain:retention -w backend
npm run db:validate:pg-constraints -w backend
npm run db:repair:shadow -w backend
```

Mutasyon yapan açık modlar:

```text
npm run db:migrate:hardening -w backend -- --apply
npm run db:migrate:hardening -w backend -- --apply --repair-pairing-duplicates
npm run db:validate:pg-constraints -w backend -- --apply --confirm-validation
npm run db:maintain:retention -w backend -- --apply --confirm-retention
npm run db:repair:shadow -w backend -- --apply --confirm-shadow-repair
```

Shadow kontrol/repair komutları için `CHECK_TENANT_ID`, PostgreSQL işlemleri için `PG_ENABLED=true` gerekir.

## Kesin üretim geçiş sırası

1. MongoDB ve PostgreSQL için doğrulanmış backup/PITR restore noktası oluştur.
2. Yeni release artifact'ini hazırla, fakat yeni backend instance'larını trafiğe açma.
3. `db:check:integrity` ve `db:migrate:hardening` dry-run çalıştır; duplicate/orphan bulgularını kaydet.
4. Gerekirse pairing duplicate repair'i kontrollü uygula; diğer unique çakışmalarını iş kararıyla temizle.
5. `db:migrate:hardening -- --apply` ile MongoDB indekslerini oluştur.
6. `db:migrate:pg` ile PostgreSQL migration 001–008 sırasını çalıştır. Runner eksik olanları uygular ve mevcut checksum'ları doğrular.
7. Yeni backend sürümünü canary instance üzerinde başlat.
8. `db:validate:pg-constraints` dry-run çalıştır. Kirli veri yoksa `--apply --confirm-validation` ile constraintleri validate et.
9. Her pilot tenant için `db:check:shadow` ve `db:check:content-parity` çalıştır.
10. Fark varsa önce `db:repair:shadow` dry-run, sonra onaylı apply ve tekrar parity kontrolü yap.
11. PostgreSQL read yüzdesini 0 → 10 → 25 → 50 → 100 olarak kademeli artır; her aşamada hata oranı, p95/p99 latency, pool waiting ve shadow parity izle.
12. Retention komutunu önce dry-run çalıştır; aday sayısı ve yasal saklama politikası onaylandıktan sonra apply et.

## Canlı veride mutlaka kontrol edilecekler

- Aynı e-posta, hardware ID, tenant nameKey, playlist nameKey/creationKey ve hazır medya checksum duplicate grupları.
- Tenant'ı, sahibi, playlist'i veya medya öğesi eksik orphan kayıtlar.
- `NOT VALID` PostgreSQL constraint sayısı ve validation sonucu.
- MongoDB ve PostgreSQL tenant bazlı aktif kayıt sayıları ve örnek alan parity'si.
- Eski `TIMESTAMP WITHOUT TIME ZONE` değerlerinin gerçekten UTC olarak yazılmış olduğu. Bu doğrulanmadan otomatik `TIMESTAMPTZ` dönüşümü yapılmamalı.
- Mongo ve PostgreSQL toplam bağlantı bütçesi: `instance sayısı × instance pool max`, veritabanı limitinin yaklaşık %70–80'ini geçmemeli.

## Tenant izolasyonu notu

Uygulama bütün CRUD sorgularında tenant/sahiplik filtresi taşımaya devam ediyor. PostgreSQL RLS politikaları `USING` ve `WITH CHECK` içeriyor; ancak uygulama bağlantı rolü tablo sahibi ise PostgreSQL varsayılan olarak RLS'yi bypass edebilir. `FORCE ROW LEVEL SECURITY` bu release içinde açılmadı; çünkü her transaction'da `SET LOCAL app.tenant_id` uygulamadan açılması shadow bakım ve sistem sorgularını kesebilir.

Tam zorunlu RLS için ayrı bir üretim değişikliği gerekir:

1. Owner olmayan uygulama rolü oluştur.
2. Her tenant sorgusunu transaction içine alıp `SET LOCAL app.tenant_id` uygula.
3. Sistem/bakım işlemlerine ayrı, denetlenen rol ver.
4. Sonra `FORCE ROW LEVEL SECURITY` canary ile aç.

Mevcut sürümde primary izolasyon katmanı uygulama predicate'leri, RLS ise defense-in-depth katmanıdır.

## Rollback ve forward-fix

- Uygulama problemi oluşursa PostgreSQL read yüzdesini hemen 0'a indir; MongoDB primary okumaya dön.
- Yeni backend sürümünü geri al, fakat uygulanmış migration dosyasını değiştirme.
- Başarısız online indeks `INVALID` kaldıysa adı ve durumu doğrulandıktan sonra ayrı forward-fix migration ile kaldırıp yeniden oluştur.
- Yeni constraint sorun çıkarırsa constrainti körlemesine silmek yerine ihlal eden satırları raporla, veriyi düzelt ve validate et.
- Shadow farklarında primary MongoDB verisini değiştirme; tenant-scoped shadow repair kullan.
- Mongo indeks rollback'i yalnızca query plan ve yazma etkisi ölçüldükten sonra ayrı migration ile yapılmalı.

## Doğrulama sonuçları

- Backend TypeScript lint/typecheck: geçti.
- Backend production build: geçti.
- Backend testleri: 90/90 geçti.
- Dashboard TypeScript lint/typecheck: geçti.
- Dashboard testleri: 5/5 geçti.
- Dashboard production build: geçti; 42 sayfa üretildi.
- Android kalite kapısı: `assembleDebug` fallback ile geçti.
- Veritabanı hedefli yeni testler: model doğrulama/indeks, kimlik eşleme, retry, circuit breaker, migration checksum/lock/online-index ve destructive bakım kilidi testleri geçti.
- `git diff --check`: hata bulunmadı.

Canlı bağlantı bilgileri paylaşılmadığı için dry-run ve migration komutları gerçek veritabanında çalıştırılmadı. Bu, kod eksikliği değil üretim güvenlik sınırıdır.
