output "server_ipv4" {
  description = "Публичный IPv4 сервера софтфона."
  value       = hcloud_server.softphone.ipv4_address
}

output "server_ipv6" {
  description = "Публичный IPv6 сервера (не используется воркером)."
  value       = hcloud_server.softphone.ipv6_address
}

output "ssh_command" {
  description = "Команда подключения для проверки."
  value       = "ssh root@${hcloud_server.softphone.ipv4_address}"
}
