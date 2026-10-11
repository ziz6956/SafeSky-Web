# SAF-234: сервер софтфона (pjsua2) для тестового прозвона через Plusofon.
# Прототип: 1 одновременный звонок. Токен Hetzner НЕ хардкодить — HCLOUD_TOKEN.

terraform {
  required_version = ">= 1.5"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
  }
}

# Провайдер автоматически читает токен из переменной окружения HCLOUD_TOKEN
# (стандартное имя hcloud-провайдера; в файлах токена нет).
provider "hcloud" {}

# SSH-ключ для управления (Ansible). Публичный ключ передаётся через
# TF_VAR_ssh_public_key — в репозитории не хранится.
resource "hcloud_ssh_key" "softphone" {
  name       = "safesky-softphone"
  public_key = var.ssh_public_key
}

resource "hcloud_firewall" "softphone" {
  name = "safesky-softphone-fw"

  # SSH только для управления; аутентификация строго по ключу.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.ssh_allowed_ips
  }

  # SIP-сигнализация (UDP 5060): входящая от Plusofon (sip.plusofon.ru).
  # TODO после пуска: заменить 0.0.0.0/0 на фактические IP медиа-серверов Plusofon.
  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "5060"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # RTP-медиа: входящий поток от медиа-сервера Plusofon.
  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "10000-20000"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "softphone" {
  name         = "safesky-softphone-01"
  image        = "debian-12"
  server_type  = var.server_type
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.softphone.id]
  firewall_ids = [hcloud_firewall.softphone.id]

  labels = {
    project = "safesky"
    role    = "softphone"
  }
}
