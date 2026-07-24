# Veritabanı Analiz ve Optimizasyon Checklisti

Son güncelleme: 24 Temmuz 2026

Bu dosya çalışma kesildiğinde devam noktasıdır. Durumlar: `[ ]` bekliyor, `[~]` devam ediyor, `[x]` tamamlandı, `[!]` canlı ortam/iş kararı bekliyor.

## Devam bilgisi

- Aktif aşama: Kod ve yerel kalite çalışması tamamlandı; yalnızca canlı ortam geçiş adımları bekliyor.
- Son tamamlanan iş: Şema/index sertleştirme, migration runner, pool/retry/circuit breaker, bütünlük/retention/shadow repair araçları ve testler.
- Sıradaki iş: Üretim backup'ı alındıktan sonra aşağıdaki `[!]` maddeleri verilen sırayla çalıştırmak.
- Canlı veritabanında mutasyon yapılmadı.
- Ayrıntılı sonuç ve rollout planı: `docs/reviews/database-optimization-report-2026-07-24.md`.
- Çalışma ağacındaki önceki kullanıcı değişikliklerine ve önceden silinmiş dosyalara dokunulmadı.

## 1. Envanter ve güvenli başlangıç

- [x] Kalıcı checklist dosyasını oluştur.
- [x] MongoDB modellerini ve bütün indeks tanımlarını envanterle.
- [x] PostgreSQL tablolarını, FK/UNIQUE/CHECK constraintlerini ve indeksleri envanterle.
- [x] MongoDB ↔ PostgreSQL shadow alan eşleşmelerini çıkar.
- [x] Migration sırası, tekrar çalıştırılabilirlik ve başarısızlık davranışını denetle.
- [x] Repository/route katmanındaki doğrudan veritabanı erişimlerini listele.
- [x] Test, parity, rollout ve bakım scriptlerinin kapsamını belirle.
- [x] Riskli debug/seed/clear scriptlerini güvenlik açısından incele ve kilitle.

## 2. MongoDB şemaları ve indeksler

- [x] Tenant izolasyonu gereken koleksiyonlarda `tenantId` zorunluluğunu doğrula; eşleşmemiş cihaz/pairing istisnalarını koru.
- [x] Hardware ID, kullanıcı e-postası, medya checksum'u, tenant ve playlist anahtar benzersizliğini doğrula.
- [x] Sorgu şekilleriyle indeks sırasını karşılaştır; bilinen çakışan indeksleri migration ile temizle.
- [x] Partial/sparse indekslerin null ve soft-delete davranışını doğrula.
- [x] Enum, uzunluk, minimum/maksimum ve varsayılan değer doğrulamalarını tamamla.
- [x] Timestamp ve sürüm alanlarını doğrula; playlist yayın sürümü/checksum eşlemesini tamamla.
- [x] Telemetry/pairing TTL'lerini doğrula; command ve pairing audit için kontrollü batch retention ekle.
- [x] Playlist/media/device referans bütünlüğü için read-only bakım kontrolü ekle.
- [x] Üretimde `autoIndex=false` ve migration-first indeks akışını yapılandır.
- [!] Canlı duplicate preflight ve Mongo hardening migration'ını backup sonrasında uygula.

## 3. PostgreSQL şeması ve migrationlar

- [x] DDL ile repository kolonlarını birebir karşılaştır ve eksik eşlemeleri tamamla.
- [x] Tenant kapsamlı FK ve benzersizlik kurallarını güçlendir.
- [x] Role/status/size/checksum/version/JSON array CHECK constraintlerini ekle.
- [x] Soft-delete partial indeksleriyle bütün upsert predicate'lerini hizala.
- [x] JSONB playlist item yapısını uygulama parser/checksum ve veritabanı array kontrolüyle koru.
- [x] Online indeks için transaction dışı tek-statement migration desteği ekle.
- [x] Migration geçmişi, checksum ve advisory lock desteği ekle.
- [x] Migrationları transaction ve tekrar çalıştırılabilirlik açısından denetle.
- [x] Rollback/forward-fix notlarını raporla.
- [!] Canlı eski timestamp değerlerinin UTC olduğu doğrulanmadan `TIMESTAMPTZ` dönüşümü yapma.
- [!] Migration 007–008'i canlı backup ve dry-run sonrası uygula; `NOT VALID` constraintleri ayrı adımda validate et.

## 4. Bağlantı, transaction ve dayanıklılık

- [x] Mongo pool, connect/server-selection/socket/wait-queue timeout ve heartbeat ayarlarını yapılandır.
- [x] PostgreSQL pool, connection/idle/statement/query/idle-transaction timeout ve max-use ayarlarını yapılandır.
- [x] Retry algoritmasını yalnızca geçici PostgreSQL/ağ hatalarıyla sınırla.
- [x] Başarısız pool açılışında sızıntı/global bozuk durum ve eşzamanlı açılış yarışını gider.
- [x] Circuit breaker HALF_OPEN durumunu tek probe ile sınırla.
- [x] SIGTERM/SIGINT sırasında trafik/socket ve veritabanı kapanış sırasını doğrula.
- [x] Mongo-primary/PostgreSQL-shadow için ölçüm, parity ve tenant-scoped batch repair stratejisi ekle.
- [x] Shadow read fallback ve kademeli read rollout guardrail'lerini koru.

## 5. Sorgu ve algoritma optimizasyonu

- [x] Runtime liste sorgularında maksimum limit/pagination uygula; bakım sorgularını batch/cursor ile sınırla.
- [x] Komut recovery N+1 save döngüsünü `bulkWrite` ve sınırlı paralellikle değiştir.
- [x] Liste uçlarında kararlı pagination ve içeride repository limitleri uygula.
- [x] Arama/benzersizlik alanlarını normalize `nameKey`, `creationKey`, email ve checksum anahtarlarıyla hizala.
- [x] `lean`, projection, `bulkWrite`, `updateMany` ve aggregation kullanımlarını denetle/uygula.
- [x] Cihaz shadow read-then-insert ve pairing code yarışlarını atomik upsert/unique partial indeksle düzelt.
- [x] 1.000–20.000 cihaz hedefinde yayın/bulk/repair batch ve bellek sınırlarını uygula.
- [x] Sayaç ve istatistik sorgularındaki paralel/aggregate kullanımlarını doğrula.

## 6. Veri bütünlüğü, güvenlik ve bakım

- [x] Tenant/user sahiplik filtrelerini CRUD yollarında doğrula.
- [x] Mongo ObjectId/UUID doğrulamasını ortaklaştır ve eksik route parametre kontrollerini ekle.
- [x] Cross-tenant playlist/media/device/user referanslarını uygulama ve PG FK katmanlarında engelle.
- [x] Silme, hesap devri, cihaz ayırma ve orphan kontrollerini ekle/doğrula.
- [x] Password hash'i varsayılan sorgulardan çıkar; hassas alanların structured loglara eklenmediğini doğrula.
- [x] Seed/clear scriptlerine production kilidi ve çift açık onay ekle.
- [x] Read-only bütünlük denetimi, Mongo index migration, constraint validation, retention ve shadow repair araçlarını ekle.
- [x] Backup/restore, indeks rollout, kapasite ve RLS notlarını raporla.
- [!] `FORCE ROW LEVEL SECURITY` için owner olmayan uygulama rolü ve transaction-scoped `SET LOCAL app.tenant_id` ayrı canary çalışması gerektirir.

## 7. Test ve kalite kapıları

- [x] Model indeks/validation testlerini ekle.
- [x] Migration bütün-script/checksum/lock/online-index testlerini ekle.
- [x] Pagination, batch, tenant izolasyonu ve yarış koşulu test kapsamını genişlet.
- [x] Mongo/PostgreSQL parity ve repair kontrollerini çalıştırılabilir hale getir.
- [x] Backend TypeScript lint/typecheck çalıştır: geçti.
- [x] Backend testlerini çalıştır: 91/91 geçti.
- [x] Dashboard TypeScript lint ve testlerini çalıştır: 5/5 geçti.
- [x] Backend ve dashboard production buildlerini çalıştır: geçti.
- [x] Tam sistem simülasyonu: 11/11 API, socket, kesinti, medya, playlist, tenant ve production dashboard tarayıcı senaryosu geçti.
- [x] Filo ölçek simülasyonu: 1.000/1.000 gerçek Socket.IO bağlantısı ve 1.000/1.000 yayın teslimatı geçti (116 ms fan-out).
- [x] Android kalite kapısını çalıştır: `assembleDebug` fallback geçti.
- [x] `git diff --check` çalıştır: hata yok.
- [x] Açık metin secret/token kalıbı taramasını çalıştır; yalnızca example/test placeholder'ları bulundu.

## 8. Teslim ve üretim geçişi

- [x] Değişiklik ve risk raporunu tamamla.
- [x] Kesin migration çalıştırma sırasını yaz.
- [x] Canlı dry-run ile belirlenecek duplicate/orphan/constraint/timestamp kontrollerini listele.
- [x] Rollout, gözlem metrikleri ve rollback/forward-fix planını yaz.
- [x] Kod checklistini tamamla; canlı erişim gerektiren maddeleri `[!]` olarak ayır.
- [!] Backup al, canlı dry-run raporunu incele ve onaylanan migration sırasını uygula.
- [!] PostgreSQL read oranını parity/SLO sağlandıkça 0 → 10 → 25 → 50 → 100 artır.

## Kanıt günlüğü

- 2026-07-21: MongoDB/PostgreSQL model, migration, repository, route ve bakım scriptleri envanterlendi.
- 2026-07-21: İlk denetimde partial-index upsert, UUID mapping, migration güvenliği, pool sızıntısı, retry storm, pairing yarışı, constraint ve retention problemleri kaydedildi.
- 2026-07-24: Kritik bulgular kod ve migration seviyesinde giderildi; dry-run/repair araçları eklendi.
- 2026-07-24: Backend 91/91, dashboard 5/5 test geçti; 11/11 tam sistem simülasyonu, backend/dashboard build ve Android test/assembleDebug/lintDebug kalite kapıları geçti.