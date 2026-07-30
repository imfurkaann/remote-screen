# Remote Screen - Bulut (Cloud) Dağıtım ve Docker Rehberi

Bu rehber, **Remote Screen** projesini (Express Backend, Next.js Dashboard, MongoDB, Redis ve Nginx) herhangi bir bulut sunucusunda (AWS, DigitalOcean, Hetzner, GCP vb.) Docker ve Docker Compose kullanarak canlı ortama taşımak için adım adım rehber içerir.

---

## 🏗️ Mimari Yapı

Proje Docker konteynerleri üzerinde isolated (izole) bridge ağında çalışır:

- **Nginx Reverse Proxy** (Port 80/443): SSL sertifikası, Statik Medya sunumu, WebSockets (`/socket.io`), API (`/api`, `/health`) ve Dashboard (`/`) yönlendirmeleri.
- **Next.js Dashboard** (Port 3000): Yönetim paneli web uygulaması (Standalone Node runtime).
- **Node.js Express Backend** (Port 4100): REST API, Socket.IO WebSockets, Medya Yöneticisi, Cihaz Eşleştirme Servisi.
- **MongoDB 7.0**: Ana veritabanı (Cihazlar, İçerikler, Oynatma Listeleri, Komutlar, Telemetri).
- **Redis 7.0**: Socket.IO adapter, oturumlar ve geçici veriler.

---

## 📋 Ön Gereksinimler

Bulut sunucunuzda (Ubuntu 22.04 / 24.04 LTS önerilir) aşağıdaki bileşenlerin yüklü olması gerekir:

1. **Docker Engine**: `24.0+`
2. **Docker Compose Plugin**: `v2.20+`
3. **Alan Adı (Domain Name)** (Örn: `api.firmam.com` ve `panel.firmam.com` veya `screen.firmam.com`)

---

## 🚀 Adım Adım Buluta Taşıma ve Kurulum

### 1. Sunucuya Klonlama veya Kod Transferi

Sunucunuza SSH ile bağlanın ve projeyi çekin:

```bash
git clone https://github.com/kullanici/remote_screen.git /opt/remote_screen
cd /opt/remote_screen
```

---

### 2. Üretkenlik Çevre Değişkenlerini (`.env.production`) Hazırlama

Örnek yapılandırma dosyasını kopyalayın:

```bash
cp .env.production.example .env.production
```

`nano .env.production` veya tercih ettiğiniz bir editör ile dosyayı açın ve aşağıdaki **gizli anahtarları** değiştirin:

> [!IMPORTANT]
> Güvenli rastgele anahtar üretmek için sunucuda aşağıdaki komutu kullanabilirsiniz:
> ```bash
> openssl rand -hex 32
> ```

Gerekli Değişkenler:
- `JWT_ACCESS_SECRET`: En az 64 karakterli rastgele metin.
- `DEVICE_BOOTSTRAP_KEY`: Cihaz ilk kurulum güvenlik anahtarı.
- `OPS_METRICS_TOKEN`: Prometheus / metrik erişim anahtarı.
- `CORS_ORIGIN`: Dashboard alan adınız (Örn: `https://panel.firmam.com`).
- `NEXT_PUBLIC_BACKEND_SOCKET_URL`: Tarayıcının bağlanacağı canlı WebSocket adresi (Örn: `https://api.firmam.com`).

---

### 3. Konteynerleri Derleme ve Başlatma

Üretim docker-compose dosyasını kullanarak tüm servisleri arka planda (`-d`) başlatın:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Konteyner durumlarını kontrol edin:

```bash
docker compose -f docker-compose.prod.yml ps
```

Tüm servislerin `healthy` veya `running` durumunda olduğunu doğrulayın.

---

### 4. Sağlık Kontrolü (Health Checks)

Sunucuda veya tarayıcıda API liveness kontrolü yapın:

```bash
curl http://localhost:4100/health/live
# Beklenen Yanıt: {"ok":true,"service":"backend"}

curl http://localhost:4100/health
# Beklenen Yanıt: MongoDB ve Redis bağlantılarının "connected: true" olduğu JSON
```

---

### 5. SSL / HTTPS Kurulumu (Let's Encrypt / Certbot)

Nginx konteynerine SSL eklemek için Certbot ile ücretsiz SSL sertifikası alabilirsiniz:

```bash
sudo apt-get update && sudo apt-get install -y certbot

# Nginx port 80 üzerinden doğrulama alarak sertifika üretme
sudo certbot certonly --standalone -d panel.firmam.com -d api.firmam.com
```

Sertifikalar `/etc/letsencrypt/live/panel.firmam.com/` altına indirildikten sonra Nginx yapılandırmanızda SSL bloklarını etkinleştirebilirsiniz.

---

## 📱 Android Player Bulut Bağlantı Ayarları

Android Player cihazlarının buluttaki sunucuya bağlanabilmesi için Android uygulamasındaki uç nokta adreslerini güncelleyin:

- `BASE_URL`: `https://api.firmam.com`
- `SOCKET_URL`: `https://api.firmam.com`

---

## 🛠️ Yönetim ve Bakım Komutları

### Logları Canlı İzleme
```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 backend
```

### Konteynerleri Durdurma / Yeniden Başlatma
```bash
# Yeniden başlatma
docker compose -f docker-compose.prod.yml restart

# Durdurma
docker compose -f docker-compose.prod.yml down
```

### MongoDB Veritabanı Yedekleme (Backup)
```bash
docker exec -t remote_screen_prod_mongo mongodump --db remote_screen_prod --out /data/db/backup_$(date +%F)
```
