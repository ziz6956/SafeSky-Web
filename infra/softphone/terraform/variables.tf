variable "server_type" {
  description = "Тип инстанса. CX22 — минимальный актуальный тип линейки Hetzner Cloud: 2 vCPU / 4 GB / 40 GB NVMe / 20 TB трафика / 1 публичный IPv4 (обоснование — README)."
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Дата-центр Hetzner. fsn1 (Фалькенштайн, DE) — по умолчанию; nbg1 — альтернатива. Для SIP-звонков в РФ задержка сигнализации не критична."
  type        = string
  default     = "fsn1"
}

variable "ssh_public_key" {
  description = "Публичный SSH-ключ управления (передаётся через TF_VAR_ssh_public_key)."
  type        = string
  sensitive   = true
}

variable "ssh_allowed_ips" {
  description = "Список IP/CIDR, с которых разрешён SSH. По умолчанию открыто — сузить до IP исполнителя после первого деплоя."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}
