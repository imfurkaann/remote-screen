# Bulut Sunucu Kurulumu, Ekran Eşleştirme ve Medya Yayınlama Rehberi

Bu rehber, **Remote Screen** sistemini canlı bulut sunucusunda (AWS, DigitalOcean, Hetzner vb.) çalıştırmak, Android ekran cihazlarına 6 haneli eşleşme kodunu göndermek ve yönetim panelinden ekranlara canlı görsel/video yayını yapmak için adım adım kılavuz içerir.

---

## 🏗️ Genel İletişim Mimarisi

```
 ┌──────────────────────┐         HTTP / WebSockets          ┌──────────────────────────┐
 │  Android Player      ├───────────────────────────────────►│  Bulut Express Backend   │
 │  (Mobil/TV Ekranlar) │◄───────────────────────────────────┤  (Port 4100 / Socket.IO) │
 └──────────────────────┘  Görsel İndirme (https://.../uploads) └────────────▲─────────────┘
                                                                             │
                                                                   REST API  │ WebSockets
                                                                             │
                                                             ┌───────────────┴──────────┐
                                                             │  Next.js Dashboard       │
                                                             │  (Yönetim Paneli - 3000) │
                                                             └──────────────────────────┘
```

---

## 🚀 Adım 1: Bulut Sunucu (Cloud VPS) Yapılandırması

### 1.1. Sunucu Bilgileri ve Domain Belirleme
Sunucunuzun IP adresi (*Örn: `185.220.100.50`*) veya alan adlarınız (*Örn: `api.firmam.com` ve `panel.firmam.com`*) ile kurulum yapabilirsiniz.

### 1.2. Çevre Değişkenleri (`.env.production`)
Proje kök dizinindeki `.env.production` dosyasını aşağıdaki gibi düzenleyin:

```env
# Canlı Ortam Değişkenleri
NODE_ENV=production
BACKEND_PORT=4100
BACKEND_BASE_URL=https://api.firmam.com
CORS_ORIGIN=https://panel.firmam.com

# Veritabanları
MONGO_URI=mongodb://mongo:27017/remote_screen_prod
REDIS_URL=redis://redis:6379

# Medya Depolama ve Kamu Erişimi
MEDIA_STORAGE_ROOT=./uploads
MEDIA_PUBLIC_BASE_URL=https://api.firmam.com/uploads
MEDIA_MAX_FILE_BYTES=524288000

# Güvenlik Anahtarları (64 Karakterli Kriptografik Hex String)
JWT_ACCESS_SECRET=9f8e7d6c5b4a39281726354415f6e7d8c9b0a1b2c3d4e5f6a7b8c9d0e1f2a3b4
DEVICE_BOOTSTRAP_KEY=1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b
OPS_METRICS_TOKEN=7f8e9d0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e

# Next.js Browser Socket Hedefi
NEXT_PUBLIC_BACKEND_SOCKET_URL=https://api.firmam.com
```

### 1.3. Nginx Reverse Proxy Ayarı (`nginx/conf.d/default.conf`)
```nginx
server {
    listen 80;
    server_name api.firmam.com panel.firmam.com;
    ...
}
```

### 1.4. Konteynerleri Başlatma ve Firewall İzinleri
Sunucunuzda aşağıdaki komutu çalıştırarak üretkenlik konteynerlerini başlatın:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Sunucu güvenlik duvarınızda (AWS Security Groups / UFW / Hetzner Firewall) şu portları dışa açın:
- `80` (HTTP) & `443` (HTTPS)
- `4100` (Backend API & WebSockets)
- `3000` (Next.js Dashboard)

---

## 📱 Adım 2: Android Player Cihaz Ayarları

Android ekran uygulamasının dünyanın neresinde olursa olsun buluttaki sunucunuza bağlanması için:

1. Projedeki `android-player/local.properties` dosyasını açın:
   ```properties
   # Bulut sunucunuzun kamu adresi
   BACKEND_BASE_URL=https://api.firmam.com

   # Sunucudaki DEVICE_BOOTSTRAP_KEY ile BİREBİR AYNI güvenlik anahtarı
   BOOTSTRAP_KEY=1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b
   ```
2. Android APK çıktısı alın (`./gradlew assembleRelease` veya Android Studio üzerinden).
3. APK'yı TV / Mobil cihazlarınıza yükleyip çalıştırın.
4. Cihaz açıldığı anda sunucuya bağlanacak ve ekranda **6 haneli sayısal eşleşme kodunu** (*Örn: 839201*) gösterecektir.

---

## 🔑 Adım 3: Giriş Bilgileri ve Ekran Eşleştirme

### 3.1. Varsayılan Giriş Bilgileri (Dosinia Super User)
- **Giriş Adresi:** `https://panel.firmam.com` veya `http://SUNUCU_IP:3000/login`
- **E-Posta:** `dosinialuxuryresort@remotescreen.dev`
- **Şifre:** `dosinia123`
- **Yetki:** Tenant Owner

### 3.2. Ekranı Sisteme Kaydetme
1. Panellerden **Screens** (Ekranlar) sayfasına gidin.
2. **Pair Screen** (Ekran Eşle) butonuna tıklayın.
3. Mobil ekranda görünen 6 haneli kodu yazın ve cihaza isim verin (*Örn: Lobi Sağ TV*).
4. **Confirm** butonuna basın. Ekrandaki 6 haneli kod anında kaybolacak ve cihaz canlı duruma geçecektir.

---

## 🖼️ Adım 4: Ekranlara Görsel & Video Gönderme İş Akışı

### 1. Medya Yükleme (Media Management)
- Panelde **Media** sekmesine girin.
- **Upload Media** butonuna basarak ekranlarda göstermek istediğiniz görselleri (`.jpg`, `.png`) veya videoları (`.mp4`) yükleyin.

### 2. Oynatma Listesi Oluşturma (Playlist Creation)
- **Playlists** sekmesine gidin ve **Create Playlist** butonuna basın.
- Bir liste ismi yazın (*Örn: Yaz Sezonu Tanıtım Listesi*).
- Yüklediğiniz görselleri listeye ekleyin, sıralamasını sürükleyerek belirleyin ve ekranda kalma sürelerini (Örn: 10 saniye) ayarlayın.
- **Save** ve **Publish** (Yayınla) butonuna basın.

### 3. Ekranı Oynatma Listesine Atama (Assigning Playlist)
- **Screens** sayfasına dönün.
- Eşleştirdiğiniz ekranın yanındaki **Edit / Assign** butonuna basın.
- Yayınlamak istediğiniz Oynatma Listesini seçip kaydedin.

✨ **Sonuç:**
Sunucu, Socket.IO WebSockets üzerinden ekrana anında sinyal gönderir. Android cihaz görseli/videoyu sunucudan (`MEDIA_PUBLIC_BASE_URL`) otomatik indirir, yerel hafızaya önbellekler ve kesintisiz oynatmaya başlar.
