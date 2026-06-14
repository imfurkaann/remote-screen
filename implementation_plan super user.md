# Kullanıcı Bazlı Veri İzolasyonu — NİHAİ Mimari Plan ve Kurumsal Adım Adım Uygulama Planı

## Araştırma Kapsamı — Tamamlandı ✅

Aşağıdaki **tüm** backend ve frontend dosyaları satır satır incelenmiş, veritabanı şemaları, API rotaları ve istemci bağlantıları analiz edilmiştir:

| Dosya | Satır | Durum |
|-------|-------|-------|
| `auth.route.ts` | 115 | ✅ İncelendi |
| `content.route.ts` | 984 | ✅ İncelendi |
| `apps.route.ts` | 1100 | ✅ İncelendi |
| `command.route.ts` | 342 | ✅ İncelendi (Yeni Açıklar Bulundu!) |
| `telemetry.route.ts` | 162 | ✅ İncelendi (Yeni Açıklar Bulundu!) |
| `pairing.route.ts` | 254 | ✅ İncelendi |
| `ops.route.ts` | 2662 | ✅ İncelendi |
| `device.model.ts` | 67 | ✅ İncelendi |
| `media.model.ts` | 36 | ✅ İncelendi |
| `playlist.model.ts` | 48 | ✅ İncelendi |
| `command.model.ts` | 68 | ✅ İncelendi |
| `pairing-code.model.ts` | 25 | ✅ İncelendi |
| `pairing-audit.model.ts` | 45 | ✅ İncelendi (Yeni Açıklar Bulundu!) |
| `command.service.ts` | 289 | ✅ İncelendi |
| `sockets/index.ts` | 298 | ✅ İncelendi |
| `content.repository.ts` | 698 | ✅ İncelendi (Yeni Açıklar Bulundu!) |
| `device.repository.ts` | 256 | ✅ İncelendi |
| `middlewares/auth.ts` | 78 | ✅ İncelendi |
| `env.ts` + `index.ts` | 81+80 | ✅ İncelendi |
| `dashboard/middleware.ts` | 71 | ✅ İncelendi |
| `dashboard/login/page.tsx` | 215 | ✅ İncelendi |
| `dashboard/layout.tsx` | 223 | ✅ İncelendi |
| `dashboard/screens/page.tsx` | 875 | ✅ İncelendi |
| `dashboard/media/page.tsx` | 2205 | ✅ İncelendi (Klasör Mantığı Deşifre Edildi!) |
| `api/content/devices/route.ts` | 28 | ✅ İncelendi |

---

## Mevcut Mimari — Gerçek Durum Haritası

```
auth.route.ts:
  VALID_USERS = sabit dizi (plain text şifre!)
  userId = "user-tenant_owner" (sabit string!)
  tenantId = "tenant-demo" (sabit string!)
  /dev-token → herhangi biri istediği role/userId ile token alabilir!

pairing.route.ts:
  /confirm → pairedOwnerUserId = req.auth.userId (DOĞRU çalışıyor)
  /device-session → cihaza 48h JWT üretiyor, owner_user_id dahil

content.route.ts:
  GET /devices → { tenantId } (ownerUserId filtresi YOK)
  GET /media → { tenantId, status: "ready" } (ownerUserId filtresi YOK)
  GET /playlists → { tenantId } (ownerUserId filtresi YOK)
  DELETE /media/:id → cascade sırasında ownerUserId kontrolü YOK
  POST /playlists/:id/publish → cihaz sahipliği kontrolü YOK

command.route.ts:
  POST /devices/:deviceId/commands → deviceId sahiplik kontrolü YOK

telemetry.route.ts:
  GET /devices/:deviceId/telemetry → deviceId sahiplik kontrolü YOK

ops.route.ts:
  /metrics → tenantId bazlı (TÜMÜNÜ görür)
  /devices/:id/troubleshoot → deviceId sahiplik kontrolü YOK
  /support-bundle → deviceId sahiplik kontrolü YOK

dashboard/middleware.ts:
  PROTECTED_PREFIXES = ["/screens", "/playlists", "/remote-control", "/operations"]
  /media, /apps, /settings → KORUMASIZ!
```

---

## 26 KRİTİK GÜVENLİK VE ENTEGRASYON RİSKİ — DETAYLI ANALİZ

### ⚠️ RİSK 1: `userId` SABİT STRING — İZOLASYON ASLA ÇALIŞMAZ
**Konum:** [`auth.route.ts` L36](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/auth.route.ts)
```typescript
// MEVCUT HAL — KÖK HATA:
const userId = `user-${user.role}`;
// owner@remotescreen.dev → userId: "user-tenant_owner"
// admin@remotescreen.dev → userId: "user-tenant_admin"
// operator@remotescreen.dev → userId: "user-operator"
```
**Açıklama:** Bu, tüm izolasyon sisteminin temel hatasıdır. İki farklı kullanıcı aynı rolü paylaşırsa aynı userId'ye sahip olur ve birbirinin verilerini görür. `UserModel` oluşturularak her kullanıcıya MongoDB ObjectId (`_id`) verilecek.

---

### ⚠️ RİSK 2: `tenantId` SABİT "tenant-demo" — ÇOK Kiracılı Sistem Çalışmaz
**Konum:** [`auth.route.ts` L40](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/auth.route.ts)
```typescript
tenant_id: "tenant-demo",  // ← sabit! Tüm kullanıcılar aynı tenant
```
**Açıklama:** Yeni `UserModel`'de her kullanıcı gerçek `tenantId` ile ilişkilendirilecek. İlk etapta tek tenant ("tenant-demo") devam edecek.

---

### 🚨 RİSK 3: `/dev-token` ENDPOINT — AÇIK GÜVENLİK AÇIĞI
**Konum:** [`auth.route.ts` L69-111](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/auth.route.ts)
```typescript
// MEVCUT HAL — HATA:
router.post("/dev-token", async (req, res) => {
  // Herhangi bir email, tenantId, role ile token alınabilir
  // Auth doğrulama YOK, herhangi bir IP'den çağrılabilir
  const userId = `user-${email.replace(...)}`; // ← sabit pattern
  // ...
  const accessToken = jwt.sign({ sub: userId, tenant_id: tenantId, role }, ...);
});
```
**Açıklama:** Bu endpoint production'da da açık. İsteyen istediği `tenant_id` ve `role: "tenant_owner"` ile geçerli JWT üretebilir. Bu endpoint tamamen kaldırılacak veya NODE_ENV === "development" durumuna kısıtlanacaktır.

---

### ⚠️ RİSK 4: `mapPlaylistItems` — Cross-User Media Sızıntısı
**Konum:** [`content.route.ts` L89-117](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/content.route.ts)
```typescript
const mediaDocs = await MediaModel.find({
  _id: { $in: mediaIds },
  tenantId,           // ← ownerUserId YOK
  status: "ready"
});
```
**Açıklama:** User A, User B'nin mediaId'sini biliyorsa o medyayı kendi playlist'ine ekleyebilir. `mapPlaylistItems` fonksiyonuna `auth` context'i geçilip sahiplik doğrulaması eklenecektir.

---

### ⚠️ RİSK 5: `DELETE /media/:id` — Cascade'de ownerUserId Kontrolü Yok
**Konum:** [`content.route.ts` L464-561](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/content.route.ts)
```typescript
const media = await MediaModel.findOne({ _id: mediaId, tenantId }); // ownerUserId YOK

// Cascade: playlistler güncelleniyor ama bunlar da ownerUserId filtresiz
const playlistsUsing = await PlaylistModel.find({
  tenantId,
  "items.mediaId": mediaId  // ownerUserId YOK
});
```
**Açıklama:** User A, User B'nin medyasını silebilir. Ayrıca cascade sırasında başkasının playlist'i de temizlenebilir.

---

### ⚠️ RİSK 6: `POST /playlists/:id/publish` — İKİLİ SAHİPLİK KONTROLÜ YOK
**Konum:** [`content.route.ts` L827-916](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/content.route.ts)
```typescript
// Playlist sahipliği kontrolsüz:
const playlist = await PlaylistModel.findOneAndUpdate(
  { _id: playlistId, tenantId },  // ← ownerUserId YOK
  ...
);

// Cihaz sahipliği kontrolsüz:
const devices = await DeviceModel.find({
  tenantId,
  $or: [{ _id: { $in: deviceIds } }, { hardwareId: { $in: deviceIds } }]
  // ← pairedOwnerUserId YOK!
});
```
**Açıklama:** User A, User B'nin playlist'ini User C'nin ekranına publish edebilir.

---

### ⚠️ RİSK 7: `PUT /devices/:id` — İçinde queueCommand Var, Sahiplik Yok
**Konum:** [`content.route.ts` L201-323](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/content.route.ts)
```typescript
const oldDevice = await DeviceModel.findOne({ _id: deviceId, tenantId }); // ownerUserId YOK
// Orientation değiştiğinde komut gönderiliyor:
await queueCommand({ tenantId, deviceId, commandType: "SET_ORIENTATION", ... });
```
**Açıklama:** User A, User B'nin cihazına orientation komutu yazarak otomatik `SET_ORIENTATION` tetikleyebilir.

---

### ⚠️ RİSK 8: `command.route.ts` — Komut Gönderme Sahiplik Kontrolü Yok
**Konum:** [`command.route.ts` L150-235](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/command.route.ts)
```typescript
const queued = await queueCommand({ tenantId, deviceId, ... });
// ← deviceId'nin kullanıcıya ait olup olmadığı kontrol edilmiyor
```
**Açıklama:** User A, User B'nin cihazına `REBOOT`, `SCREENSHOT`, `SCREEN_OFF` komutları gönderebilir.

---

### ⚠️ RİSK 9: `telemetry.route.ts` — GET Sahiplik Kontrolü Yok
**Konum:** [`telemetry.route.ts` L118-158](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/telemetry.route.ts)
```typescript
const telemetry = await TelemetryModel.find({ tenantId, deviceId });
// ← deviceId bu kullanıcıya ait mi kontrol edilmiyor
```

---

### ⚠️ RİSK 10: `ops.route.ts` — Troubleshoot ve Support Bundle Sahiplik Yok
**Konum:** [`ops.route.ts` L157-429](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/ops.route.ts)
```typescript
const device = await DeviceModel.findOne({ _id: deviceId, tenantId }).lean();
// ← pairedOwnerUserId kontrolü YOK
```
**Açıklama:** `/ops` rotaları tüm tenant verisini okuduğu için sadece `tenant_owner` yetkisine sınırlandırılacaktır.

---

### ⚠️ RİSK 11: Socket `dispatch:sync` — Ekrana İçerik Push Sızıntısı
**Konum:** [`sockets/index.ts` L286-294](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/sockets/index.ts)
```typescript
dashboardNs.on("connection", (socket) => {
  socket.on("dispatch:sync", ({ device_id, payload }) => {
    deviceNs.to(`device:${device_id}`).emit("SYNC_CONTENT", payload);
    // device_id sahiplik kontrolü YOK
  });
});
```

---

### ⚠️ RİSK 12: `processDeviceAck` — tenantId Yok
**Konum:** [`command.service.ts` L211-225](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/services/command.service.ts)
```typescript
let command = await CommandModel.findOne({
  deviceId: payload.device_id,
  commandId: payload.command_id
  // tenantId YOK
});
```

---

### ⚠️ RİSK 13: PostgreSQL `ShadowMediaInput` — `ownerUserId` Alanı Yok
**Konum:** [`content.repository.ts` L9-19](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/repositories/content.repository.ts)
`listMedia(tenantId, limit)` shadow veri okumalarında kullanıcı ayrımı olmaksızın tüm tenant verilerini getirir.

---

### ⚠️ RİSK 14: Dashboard `middleware.ts` — `/media`, `/apps`, `/settings` Korumasız
**Konum:** [`dashboard/middleware.ts` L4](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/dashboard/middleware.ts)
```typescript
const PROTECTED_PREFIXES = ["/screens", "/playlists", "/remote-control", "/operations"];
```
**Açıklama:** Giriş yapmadan `/media` ve `/apps` arayüzüne erişim mümkündür.

---

### ⚠️ RİSK 15: `MediaModel` Tipi — `ownerUserId` ve `folder` Eksikliği
**Konum:** [`media.model.ts` L5-15](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/models/media.model.ts)
Tip ve Mongoose şemasında yeni alanlar eklenmelidir.

---

### ⚠️ RİSK 16: `PlaylistModel` Tipi — `ownerUserId` Eksikliği
**Konum:** [`playlist.model.ts` L13-19](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/models/playlist.model.ts)

---

### ⚠️ RİSK 17: `DeviceModel` — `pairedOwnerUserId` Index'i Yok
**Konum:** [`device.model.ts` L51](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/models/device.model.ts)
Operatör bazlı ekran listelemelerinde veritabanı yavaşlamasını önlemek için index eklenmelidir.

---

### ⚠️ RİSK 18: Migration — Sabit `user-tenant_owner` String Eşleşmeleri
Eski paired verilerin `pairedOwnerUserId` alanı `"user-tenant_owner"` dizesidir. Yeni sistem Mongoose ObjectId kullandığında eski ekranlar yetkisiz kalır. Göç scripti ile güncellenmelidir.

---

### ⚠️ RİSK 19: `ownerUserId` = null Olan Eski Kayıtlar
Eski medya ve playlistlerin sahipliği null olduğundan bu kayıtların default Owner kullanıcısına atanması gerekir.

---

### ⚠️ RİSK 20: `ops.route.ts`'deki `governance.service.ts` — Bilinmeyen Bağımlılık
**Konum:** [`ops.route.ts` L11](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/ops.route.ts)
```typescript
import { evaluateGovernancePolicy, ... } from "../services/governance.service.js";
```
Bu servis tenant genelinde çalıştığı için `/ops` rotaları tamamen `tenant_owner` yetkisine kısıtlanarak sızıntı önlenecektir.

---

### 🚨 RİSK 21: `command.route.ts` — Operator Komut/Screenshot Yetki Sızıntısı (Yeni!)
**Konum:** [`command.route.ts` L106-146](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/command.route.ts)
Operatörlerin hedeflenen `deviceId` üzerinde sahipliği olup olmadığı doğrulanmadığı için yetkisiz ekran görüntüsü alma veya komut gönderme riski mevcuttur.

---

### 🚨 RİSK 22: `telemetry.route.ts` — Operator Telemetri Sızıntısı (Yeni!)
**Konum:** [`telemetry.route.ts` L118-158](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/routes/telemetry.route.ts)
`GET /devices/:deviceId/telemetry` rotasında sahiplik doğrulaması olmaması nedeniyle operatörlerin tüm tenant telemetrilerini okuyabilmesi açığı.

---

### 🚨 RİSK 23: `pairing-audit.model.ts` — Migration Boşluğu (Yeni!)
**Konum:** [`pairing-audit.model.ts` L15](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/models/pairing-audit.model.ts)
`actorId` alanında eski `"user-*"` id'lerinin bulunması ve yeni ObjectId'lere geçildiğinde audit geçmişinin bozulma riski.

---

### 🚨 RİSK 24: `content.repository.ts` — PostgreSQL Shadow Listeleme Sızıntısı (Yeni!)
**Konum:** [`content.repository.ts` L374-438, L515-578](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/repositories/content.repository.ts)
SQL shadow okumalarında `owner_user_id` filtresinin olmaması nedeniyle veritabanından yetkisiz veri sızması riski.

---

### 🚨 RİSK 25: PostgreSQL Şemasında `folder` Sütunu Eksikliği (Yeni!)
**Konum:** [`002_shadow_content_and_commands.sql` L1](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/db/migrations/002_shadow_content_and_commands.sql)
Klasör verilerinin shadow Postgres tablosunda yer almaması nedeniyle veri tabanı yazma senkronizasyonunun bozulması riski.

---

### 🚨 RİSK 26: Sockets `emitDashboardCommandAck` Broadcast Sızıntısı (Yeni!)
**Konum:** [`sockets/registry.ts` L61](file:///c:/Users/imfurkaann/Documents/projects/remote_screen/backend/src/sockets/registry.ts)
`emitDashboardCommandAck` metodunun tüm bağlı soketlere yayın yapması sebebiyle operatörlerin diğer operatörlere ait komut çıktılarını ve screenshot URL'lerini canlı yakalayabilmesi açığı.

---

## MİMARİ VE KOD DEĞİŞİKLİKLERİ DETAYLARI

### BÖLÜM 1 — Backend: Auth Sistemi ve Seed Yapısı
#### [MODIFY] `auth.route.ts` — TAMAMEN
```typescript
// Seed Logic (Bootstrap):
const ownerExists = await UserModel.findOne({ email: "owner@remotescreen.dev" });
if (!ownerExists) {
  for (const u of VALID_USERS) {
    await UserModel.create({
      tenantId: "tenant-demo",
      email: u.email,
      passwordHash: await hashPassword(u.password),
      role: u.role,
      displayName: u.role,
      isActive: true
    });
  }
}
```

#### [NEW] `backend/src/models/user.model.ts`
```typescript
export type UserDoc = {
  tenantId: string;
  email: string;
  passwordHash: string;
  role: "tenant_owner" | "tenant_admin" | "operator" | "viewer";
  displayName: string;
  isActive: boolean;
};
```

#### [NEW] `backend/src/lib/bcrypt.ts`
```typescript
import bcrypt from "bcryptjs";
export async function hashPassword(plain: string) { return bcrypt.hash(plain, 10); }
export async function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash); }
```

---

### BÖLÜM 2 — Backend: Model Güncellemeleri
#### [MODIFY] `backend/src/models/media.model.ts`
```typescript
ownerUserId: { type: String, default: null, index: true },
folder: { type: String, default: null },
```

#### [MODIFY] `backend/src/models/playlist.model.ts`
```typescript
ownerUserId: { type: String, default: null, index: true },
```

#### [MODIFY] `backend/src/models/device.model.ts`
```typescript
DeviceSchema.index({ tenantId: 1, pairedOwnerUserId: 1 });
```

#### [NEW] `backend/src/models/media-folder.model.ts`
```typescript
type MediaFolderDoc = {
  tenantId: string;
  ownerUserId: string;
  name: string;
};
```

---

### BÖLÜM 3 — Backend: content.route.ts Güncellemeleri
```typescript
type AuthCtx = { userId: string; tenantId: string; role: string };

function buildMediaFilter(auth: AuthCtx, extra: Record<string, any> = {}) {
  const base = auth.role === "tenant_owner"
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, ownerUserId: auth.userId };
  return { ...base, ...extra };
}

function buildDeviceFilter(auth: AuthCtx, extra: Record<string, any> = {}) {
  const base = auth.role === "tenant_owner"
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, pairedOwnerUserId: auth.userId };
  return { ...base, ...extra };
}

async function assertDeviceOwnership(deviceId: string, auth: AuthCtx): Promise<boolean> {
  if (auth.role === "tenant_owner") return true;
  const d = await DeviceModel.findOne({ _id: deviceId, tenantId: auth.tenantId, pairedOwnerUserId: auth.userId });
  return d !== null;
}
```

#### Endpoint Güncelleme Tablosu

| Endpoint | Eski Filtre | Yeni Filtre | Yetki Kontrolü |
|----------|-------------|-------------|----------------|
| `GET /devices` | `{ tenantId }` | `buildDeviceFilter(auth)` | Yok |
| `PUT /devices/:id` | `{ _id, tenantId }` | `buildDeviceFilter(auth)` | Cihaz Sahipliği |
| `DELETE /devices/:id` | `{ _id, tenantId }` | `buildDeviceFilter(auth)` | Cihaz Sahipliği |
| `GET /media` | `{ tenantId, status }` | `buildMediaFilter(auth, { status })` | Yok |
| `POST /media/upload` | ownerUserId yok | `ownerUserId: auth.userId` | Yok |
| `DELETE /media/:id` | `{ _id, tenantId }` | `buildMediaFilter(auth)` | Medya Sahipliği |
| `GET /playlists` | `{ tenantId }` | `buildMediaFilter(auth)` | Yok |
| `POST /playlists` | ownerUserId yok | `ownerUserId: auth.userId` | `mapPlaylistItems` korumalı |
| `POST /playlists/:id/publish` | Cihaz kontrolü yok | `buildDeviceFilter(auth)` | Playlist ve Cihaz Sahipliği |

---

### BÖLÜM 4 — Backend: apps.route.ts İzolasyon Kontrolü
* `POST /create-app` işlemine `ownerUserId: req.auth.userId` eklenecektir.
* `PUT /update-app/:id` işleminde `buildMediaFilter(req.auth)` ile sahiplik doğrulanacaktır.

---

### BÖLÜM 5 — Backend: command.route.ts Sahiplik Kontrolü
* `/devices/:deviceId/commands` ve `/devices/:deviceId/screenshot` işlemlerinde `assertDeviceOwnership(deviceId, req.auth!)` doğrulaması yapılacaktır.

---

### BÖLÜM 6 — Backend: telemetry.route.ts Sahiplik Kontrolü
* `GET /devices/:deviceId/telemetry` rotasında `assertDeviceOwnership` kontrolü yapılacaktır.

---

### BÖLÜM 7 — Backend: ops.route.ts Kısıtlaması
* Rota tamamen `tenant_owner` yetkisine kapatılacaktır:
```typescript
router.use(requireRoles(["tenant_owner"]));
```

---

### BÖLÜM 8 — Backend: Soket Sunucusu ve Yetkili Odalar
* Soket bağlantısında JWT verification yapılacak ve istemciler belirli odalara atanacaktır:
```typescript
socket.join(`dashboard:user:${auth.userId}`);
if (auth.role === "tenant_owner") {
  socket.join(`dashboard:tenant:${auth.tenantId}:owner`);
}
```
* Cihazlardan gelen komut geri bildirimleri (`HEARTBEAT` / `COMMAND_ACK`) yalnızca bu yetkili odalara yönlendirilecektir (Risk 26 çözümü).

---

### BÖLÜM 9 — Backend: PostgreSQL Shadow ve Migration SQL
#### `content.repository.ts` Güncellemesi:
* `ShadowMediaInput` ve `ShadowPlaylistInput` yapılarına `ownerUserId` ve `folder` kolonları bağlanır.
* SQL listeleme sorgularına (`listMedia` / `listPlaylists`) `ownerUserId` parametresi filtrelenir.

---

### BÖLÜM 10 — Backend: `migrate-user-isolation.ts` Scripti
* MongoDB `pairedOwnerUserId` alanlarını ve PostgreSQL shadow verilerini default Owner kullanıcısının gerçek ObjectId'si ile günceller. Audit loglarındaki eski `actorId` dizesini taşır.

---

### BÖLÜM 11 — Dashboard: middleware.ts Matcher Koruması
* `/media`, `/apps` ve `/settings` rotaları `middleware` korumasına ve matcher dizisine eklenecektir. Operatörlerin `/settings` sayfasına erişimi engellenecektir.

---

### BÖLÜM 12 — Dashboard: Kullanıcı Arayüz Güncellemeleri
* **login/page.tsx:** Demo giriş badges temizlenecektir.
* **layout.tsx:** Yöneticilere özel `/settings/users` menü linki eklenecektir.
* **media/page.tsx:** Klasör yönetimi `localStorage` yerine Next.js proxy API'lerine yönlendirilecektir.

---

## 📅 UYGULAMA FAZLARI VE ADIMLARI (Mesai Kesintilerine Dayanıklı)

### Faz 1: Altyapı, Paketler ve Şemalar (Adım 1.1 - 1.4)
* `bcryptjs` paketi kurulur. PostgreSQL SQL migration dosyası oluşturulur. MongoDB şemaları güncellenir ve Postgres repository sorguları uyumlu hale getirilir.

### Faz 2: Göç ve Seeding (Adım 2.1 - 2.3)
* `migrate-user-isolation.ts` göç scripti yazılır ve çalıştırılır. Bootstrap seed yapısı sunucu girişine eklenir.

### Faz 3: Yetkilendirme ve Kullanıcı Yönetimi (Adım 3.1 - 3.4)
* MongoDB login yapısı aktif edilir, kullanıcı CRUD rotaları backend ve Next.js proxy'lerine eklenir. `/settings/users` sayfası tamamlanır. Kullanıcı pasifleştirildiğinde soket ve JWT anlık iptal mekanizmaları kurulur.

### Faz 4: İçerik ve Klasör İzolasyonu (Adım 4.1 - 4.5)
* Medya ve playlist listelemelerine sahiplik filtreleri ve pagination eklenir. Veritabanı klasör yönetimi endpointleri ve Next.js API'leri yazılarak `media/page.tsx` entegrasyonu yapılır.

### Faz 5: Ekran Güvenliği ve Soket Odaları (Adım 5.1 - 5.4) — Tamamlandı ✅
* Komut ve telemetri rotalarında cihaz sahiplik kontrolleri doğrulanır. Soket sunucusunda JWT auth, kullanıcı odaları ve komut ACK yönlendirmesi (Risk 26 çözümü) tamamlanır. Ops rotası kısıtlanır ve testler başarıyla doğrulanır.

### Faz 6: Frontend Middleware ve Erişim Güvenliği (Adım 6.1 - 6.3) — Tamamlandı ✅
* Next.js ara katmanı ve login/layout sayfalarındaki son kısıtlamalar tamamlanır. Rotalar korumaya alınır, demo badges temizlenir ve link filtreleri güncellenir.

### Faz 7: Yük, Performans ve Entegrasyon Testleri (Adım 7.1 - 7.3) — Tamamlandı ✅
* İndeks analizleri (Media ve Playlist modellerine compound indeksler eklendi), emülatör eşleştirme ve otomatik testler ile sistem doğrulanır. Bütün testler başarıyla geçer.

### Faz 8: Süper Yönetici (Super Admin) Rolü ve Kiracı/Kullanıcı Yönetim Paneli (Adım 8.1 - 8.5)
* **Adım 8.1: Veri Modelleri Güncellemesi:**
  - `user.model.ts` içerisindeki rollere `super_admin` eklenecek.
  - [NEW] `tenant.model.ts` oluşturularak kiracılar MongoDB üzerinde takip edilecek.
* **Adım 8.2: Auth Middleware ve Seeding:**
  - `middlewares/auth.ts` -> `requireRoles` güncellenerek `super_admin` kullanıcısının yetki kontrollerini bypass etmesi sağlanacak.
  - `auth.route.ts` seed fonksiyonuna `superadmin@remotescreen.dev` (`super123`) kullanıcısının otomatik oluşturulması eklenecek.
* **Adım 8.3: Super Admin Backend Rotaları:**
  - [NEW] `routes/super.route.ts` oluşturularak kiracı listeleme/yaratma, tüm kullanıcıları listeleme, tüm cihazları listeleme ve global istatistik uç noktaları eklenecek.
  - Rotadaki kiracı bağımlı sorgular (ekran, playlist vb.) güncellenerek `super_admin` için kiracı filtresiz (veya opsiyonel `?tenant_id=...` filtreli) çalışması sağlanacak.
  - Sockets `checkDeviceAccess` süper admin için otomatik `true` dönecek.
* **Adım 8.4: Next.js Proxy ve Middleware Entegrasyonu:**
  - `dashboard/middleware.ts` güncellenerek `super_admin` rolünün korumalı sayfalar ve `/super-admin` alt yollarına erişimi sağlanacak.
  - [NEW] `dashboard/src/app/api/super/tenants/route.ts`, `dashboard/src/app/api/super/users/route.ts` ve `dashboard/src/app/api/super/stats/route.ts` proxy rotaları oluşturulacak.
* **Adım 8.5: Süper Yönetici Paneli Arayüzü:**
  - [NEW] `dashboard/src/app/(dashboard)/super-admin/page.tsx` modern, cam-morfoloji (glassmorphism) tasarımlı yönetim paneli eklenecek. Kiracı oluşturma, kiracıya ait kullanıcıları yönetme, tüm ekranları izleme fonksiyonları eklenecek.
  - `layout.tsx` navigasyonu güncellenerek süper adminler için "Sistem Yönetimi" bağlantısı eklenecek.

---

## Doğrulama Planı

### Otomatik Testler
* `npm run lint` (Derleme doğrulaması)
* `npm test` (Entegrasyon testleri)
* `npm run db:migrate:pg` (SQL şema doğrulaması)

### Manuel Doğrulama Adımları
1. **İzolasyon Testi:** Farklı operatörlerin birbirinin görsellerini ve klasörlerini görmediğini doğrula.
2. **Soket ACK Testi:** Operatör A ekran görüntüsü aldığında, Operatör B'nin tarayıcı konsoluna veya soketine screenshot URL sızmadığını (Risk 26) kontrol et.
3. **Anlık İptal Testi:** Aktif bir operatörün hesabı silindiğinde veya dondurulduğunda soket bağlantısının anında kesildiğini doğrula.
4. **Kaynak Devri Testi:** Silinen operatöre ait cihazların Owner kullanıcısına otomatik devrolduğunu veritabanından teyit et.
