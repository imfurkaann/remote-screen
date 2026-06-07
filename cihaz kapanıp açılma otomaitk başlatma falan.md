# Dayanıklılık Analizi — İnternet Kesilmesi / Kapanma / Elektrik Kesilmesi

## Senaryo Başına Mevcut Durum

### 📶 Senaryo 1: İnternet gitti → geldi

| Bileşen | Mevcut Davranış | Durum |
|---------|-----------------|-------|
| **PlaybackCoordinator** | Lokal Room DB'den oynatır, network bağımlısı değil | ✅ |
| **SocketClientManager** | `setReconnection(true)`, `Int.MAX_VALUE` attempt, exponential backoff 1s→30s | ✅ |
| **SessionManager** | Transient error (5xx, timeout) → state korur, backoff ile yeniden dener | ✅ |
| **ContentSyncManager** | Download retry 3× (eklendi) | ✅ |
| **Pairing state** | SharedPreferences'ta kalıcı — network olmadan anında "Paired" state | ✅ |
| **SYNC_CONTENT alınamadı** | Internet yokken gelen publish → kaybolur (offline cihaza socket emit edilemez). Cihaz bağlanınca tekrar alır (socket `connection` event'i) | ✅ (connection sync var) |
| **Bağlantı kesilince ekranda ne görünür?** | Mevcut playlist oynatılmaya devam eder (lokal dosya) | ✅ |
| **HeartbeatBuffer flush** | Socket emit başarısız olsa da buffer memory'de kalır, reconnect sonrası gönderilir | ✅ |

---

### ⚡ Senaryo 2: Cihaz kapandı → açıldı (normal kapatma)

| Bileşen | Mevcut Davranış | Durum |
|---------|-----------------|-------|
| **BootReceiver** | `ACTION_BOOT_COMPLETED` → `StartupCoordinator.enqueueStartup()` | ⚠️ **KAYITLI DEĞİL** |
| **AndroidManifest** | BootReceiver declare edilmemiş! | 🔴 |
| **Playlist (Room DB)** | Kalıcı, açılışta mevcut | ✅ |
| **Pairing token** | SharedPreferences'ta kalıcı | ✅ |
| **Video pozisyonu** | SharedPreferences ile kaydedildi, restore edilir | ✅ |
| **Socket reconnect** | `initialize()` çağrılınca başlar, otomatik yeniden bağlanır | ✅ |
| **Otomatik başlatma** | `ACTION_BOOT_COMPLETED` çalışmıyor → app açılmaz | 🔴 |

---

### ⚡ Senaryo 3: Elektrik kesildi → geldi (ani kapanma / process kill)

| Bileşen | Mevcut Davranış | Durum |
|---------|-----------------|-------|
| **Playlist dosyaları** | `/filesDir/content/active/` klasöründe — kalıcı | ✅ |
| **Room DB** | SQLite → WAL mode, ani kapanmaya dayanıklı | ✅ |
| **SharedPreferences** | `.apply()` kullanıyor (async) — veri **kaybolabilir** | ⚠️ |
| **Staging dir cleanup** | `ContentSyncManager`: staging-{version} temizliği yok eğer sync ortasında kesilirse | ⚠️ |
| **HeartbeatBuffer** | In-memory → kaybolur | ✅ (OK, telemetry non-critical) |
| **PlaybackState** | `.apply()` ile kaydedilir — kesilme anında son 1-2 kayıt kaybolabilir | ⚠️ |
| **Otomatik başlatma** | Manifest'te kayıtlı değil → ekran açılır ama uygulama başlamaz | 🔴 |

---

## 🔴 Kritik Sorunlar

### 1. BootReceiver AndroidManifest'te Declare Edilmemiş!

`BootReceiver.kt` yazılmış ama `AndroidManifest.xml`'de kayıtlı değil.
Bu yüzden **cihaz açıldığında uygulama başlamıyor**. Ekran siyah/launcher görünür.

**Eksik** olan manifest kaydı:
```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<receiver
    android:name=".boot.BootReceiver"
    android:enabled="true"
    android:exported="false">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

Ayrıca: `BootReceiver.enqueueStartup()` çağırıyor ama bu `enqueueStartup()` WorkManager değil — doğrudan coroutine başlatıyor. Background işlemler için Android'de **WorkManager** veya **Foreground Service** gerekli. `BootReceiver.onReceive()` 10 saniyeden uzun çalışamaz.

---

### 2. SharedPreferences `.apply()` — Ani Kapanmada Kayıp

`PlaybackStateStore.save()` → `.apply()` kullanıyor (asenkron, background thread).
Elektrik kesildiğinde bu write commit olmayabilir → video pozisyonu kaybolur.

```kotlin
// MEVCUT — riskli:
prefs.edit()
    .putInt(KEY_MEDIA_INDEX, mediaIndex)
    .putLong(KEY_POSITION_MS, positionMs)
    .apply()   // ← asenkron, kayıp riski

// GÜVENLİ — kritik veriler için:
prefs.edit()
    .putInt(KEY_MEDIA_INDEX, mediaIndex)
    .putLong(KEY_POSITION_MS, positionMs)
    .commit()  // ← senkron, başarı garantili
```

---

### 3. Dirty Staging Directory — Yarım Kalan Sync

`ContentSyncManager.applySyncPayload()` → `stagingDir = "staging-{version}"` oluşturur.
Eğer dosya indirme ortasında elektrik kesilirse staging klasörü kalır.
Bir sonraki açılışta `forceRefreshFromActiveCache()` çağrılır ama staging temizlenmez → disk dolabilir.

---

### 4. Foreground Service Yok — Android Arka Plan Kısıtlamaları

Android 8+ (API 26+): arka plan uygulamalar birkaç dakika sonra sistem tarafından öldürülür.
Bu uygulama bir kiosk / signage cihazı — **sürekli çalışması** gerekir.
Şu an `Foreground Service` yok → sistem RAM baskısında uygulamayı öldürür.

---

## 🟡 Orta Öncelik Eksikler

### 5. Network Değişikliği Algılama Yok (`ConnectivityManager`)

Internet geldiğinde socket zaten reconnect ediyor (Socket.IO internal retry). Ama bu yeterli değil:
- Ağ geçişinde (WiFi → Ethernet → WiFi) socket bazen stale kalır
- Android `ConnectivityManager.NetworkCallback` ile network gelince socket'i manuel force-reconnect yapmak gerekir

### 6. Cihaz Kiosk Modu / Lock Task Yok

Kullanıcı "Geri" veya "Home" tuşuna basınca uygulamadan çıkabilir.
Signage cihazlarda **lock task mode** etkinleştirilmeli.

### 7. `ACTION_LOCKED_BOOT_COMPLETED` Eksik

Şifreli cihazlarda (FDE) `ACTION_BOOT_COMPLETED` kullanıcı kilidini açana kadar gelmez.
`ACTION_LOCKED_BOOT_COMPLETED` + `directBootAware=true` gerekli.

### 8. WatchDog / Crash Recovery Yok

Uygulama beklenmedik exception ile crash olursa hiçbir şey onu yeniden başlatmıyor (Foreground Service restart olmadan). PlaybackCoordinator'daki `SupervisorJob` coroutine hatalarını yakalar ama JVM crash'i yakalamaz.

---

## Öncelik Özeti

| # | Senaryo | Sorun | Öncelik |
|---|---------|-------|---------|
| 1 | Cihaz açıldı | BootReceiver Manifest'te kayıtlı değil → app başlamıyor | 🔴 Kritik |
| 2 | Elektrik kesildi | PlaybackStateStore `.apply()` → veri kayıp riski | 🔴 Kritik |
| 3 | Sync ortası kesilme | Dirty staging dir birikmesi | 🟡 Orta |
| 4 | Cihaz çalışırken | Foreground Service yok → Android tarafından öldürülebilir | 🔴 Kritik |
| 5 | İnternet geldi | ConnectivityManager ile proaktif reconnect yok | 🟡 Orta |
| 6 | Kullanıcı müdahalesi | Lock Task / Kiosk modu yok | 🟡 Orta |
| 7 | Şifreli cihaz açılışı | LOCKED_BOOT_COMPLETED + directBootAware eksik | 🟡 Orta |
| 8 | App crash | WatchDog / otomatik restart yok | 🟡 Orta |
