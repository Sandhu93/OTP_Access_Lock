#include <Arduino.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiUdp.h>

#include <esp_netif.h>
#include <esp_wifi.h>

#include <cstddef>
#include <cstring>

// Standalone, local-demo SoftAP for a separate classic ESP32 DevKit.
// This is not an internet modem/router: there is no WAN, NAT, or lock control.
// Static DHCP reservations are implemented by the small DHCP service below;
// the stock ESP-IDF DHCP server is stopped before it can answer clients.

namespace {

constexpr char kSsid[] = "AccessLock-Demo";
constexpr char kPrefsNamespace[] = "aprouter";
constexpr char kReservationsKey[] = "reservations";
constexpr char kAdminUser[] = "admin";
constexpr uint8_t kChannel = 6;
constexpr uint8_t kMaxStations = 4;
constexpr uint8_t kReservationCapacity = 8;
constexpr uint8_t kReservationIpFirst = 2;
constexpr uint8_t kReservationIpLast = 19;
constexpr uint8_t kDynamicIpFirst = 20;
constexpr uint8_t kDynamicIpLast = 30;
constexpr uint32_t kLeaseSeconds = 86400;
constexpr uint32_t kLeaseMillis = kLeaseSeconds * 1000UL;
constexpr size_t kMinSecretLength = 12;
constexpr size_t kMaxSecretLength = 63;

const IPAddress kApIp(192, 168, 4, 1);
const IPAddress kSubnet(255, 255, 255, 0);
const uint8_t kDhcpCookie[4] = {99, 130, 83, 99};

#pragma pack(push, 1)
struct DhcpPacket {
  uint8_t op, htype, hlen, hops;
  uint8_t xid[4];
  uint8_t secs[2], flags[2];
  uint8_t ciaddr[4], yiaddr[4], siaddr[4], giaddr[4];
  uint8_t chaddr[16];
  uint8_t sname[64];
  uint8_t file[128];
  uint8_t cookie[4];
  uint8_t options[312];
};
#pragma pack(pop)

struct Reservation {
  uint8_t active;
  uint8_t mac[6];
  uint8_t ipLastOctet;
  char label[24];
};

struct Lease {
  bool active;
  uint8_t mac[6];
  uint8_t ipLastOctet;
  uint32_t touchedAt;
};

static_assert(offsetof(DhcpPacket, cookie) == 236, "Invalid BOOTP layout");

Preferences preferences;
WebServer web(80);
WiFiUDP dhcpUdp;
Reservation reservations[kReservationCapacity] = {};
Lease leases[kMaxStations * 2] = {};
char apPassword[kMaxSecretLength + 1] = {};
char adminPassword[kMaxSecretLength + 1] = {};

bool macEqual(const uint8_t* lhs, const uint8_t* rhs) {
  return memcmp(lhs, rhs, 6) == 0;
}

String macToString(const uint8_t* mac) {
  char text[18];
  snprintf(text, sizeof(text), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(text);
}

bool parseMac(const String& input, uint8_t* mac) {
  if (input.length() != 17) return false;
  unsigned values[6];
  const int parsed = sscanf(input.c_str(), "%2x:%2x:%2x:%2x:%2x:%2x",
                            &values[0], &values[1], &values[2], &values[3],
                            &values[4], &values[5]);
  if (parsed != 6) return false;
  for (size_t i = 0; i < 6; ++i) mac[i] = static_cast<uint8_t>(values[i]);
  return true;
}

String htmlEscape(const String& input) {
  String result;
  result.reserve(input.length() + 8);
  for (size_t i = 0; i < input.length(); ++i) {
    const char c = input[i];
    if (c == '&') result += "&amp;";
    else if (c == '<') result += "&lt;";
    else if (c == '>') result += "&gt;";
    else if (c == '"') result += "&quot;";
    else if (c == '\'') result += "&#39;";
    else result += c;
  }
  return result;
}

bool readSecret(const char* prompt, char* output, size_t outputSize) {
  for (;;) {
    Serial.printf("%s (%u-%u characters): ", prompt,
                  static_cast<unsigned>(kMinSecretLength),
                  static_cast<unsigned>(kMaxSecretLength));
    size_t length = 0;
    bool overflow = false;
    while (true) {
      if (!Serial.available()) {
        delay(10);
        continue;
      }
      const char ch = static_cast<char>(Serial.read());
      if (ch == '\r') continue;
      if (ch == '\n') break;
      if (ch >= 32 && ch <= 126) {
        if (length < outputSize - 1) output[length++] = ch;
        else overflow = true;
      }
    }
    if (!overflow && length >= kMinSecretLength && length <= kMaxSecretLength) {
      output[length] = '\0';
      Serial.println("Accepted; value was not printed or saved.");
      return true;
    }
    memset(output, 0, outputSize);
    Serial.println("Invalid length; try again.");
  }
}

void loadReservations() {
  preferences.begin(kPrefsNamespace, false);
  if (preferences.getBytesLength(kReservationsKey) == sizeof(reservations)) {
    preferences.getBytes(kReservationsKey, reservations, sizeof(reservations));
  }
  // Discard malformed or out-of-pool entries rather than trusting stale NVS.
  for (auto& entry : reservations) {
    if (!entry.active) continue;
    if (entry.ipLastOctet < kReservationIpFirst ||
        entry.ipLastOctet > kReservationIpLast || entry.label[sizeof(entry.label) - 1] != '\0') {
      memset(&entry, 0, sizeof(entry));
      continue;
    }
    for (const auto& other : reservations) {
      if (&entry != &other && other.active &&
          (other.ipLastOctet == entry.ipLastOctet || macEqual(other.mac, entry.mac))) {
        memset(&entry, 0, sizeof(entry));
        break;
      }
    }
  }
}

bool saveReservations() {
  return preferences.putBytes(kReservationsKey, reservations, sizeof(reservations)) ==
         sizeof(reservations);
}

int reservationByMac(const uint8_t* mac) {
  for (uint8_t i = 0; i < kReservationCapacity; ++i) {
    if (reservations[i].active && macEqual(reservations[i].mac, mac)) return i;
  }
  return -1;
}

int reservationByIp(uint8_t lastOctet) {
  for (uint8_t i = 0; i < kReservationCapacity; ++i) {
    if (reservations[i].active && reservations[i].ipLastOctet == lastOctet) return i;
  }
  return -1;
}

int leaseByMac(const uint8_t* mac) {
  for (size_t i = 0; i < sizeof(leases) / sizeof(leases[0]); ++i) {
    if (leases[i].active && millis() - leases[i].touchedAt < kLeaseMillis &&
        macEqual(leases[i].mac, mac)) return static_cast<int>(i);
  }
  return -1;
}

bool ipUsedByOtherMac(uint8_t lastOctet, const uint8_t* mac) {
  const int reserved = reservationByIp(lastOctet);
  if (reserved >= 0 && !macEqual(reservations[reserved].mac, mac)) return true;
  for (const auto& lease : leases) {
    if (lease.active && millis() - lease.touchedAt < kLeaseMillis &&
        lease.ipLastOctet == lastOctet && !macEqual(lease.mac, mac)) return true;
  }
  return false;
}

void rememberLease(const uint8_t* mac, uint8_t lastOctet) {
  int index = leaseByMac(mac);
  if (index < 0) {
    uint32_t oldestAge = 0;
    index = 0;
    for (size_t i = 0; i < sizeof(leases) / sizeof(leases[0]); ++i) {
      if (!leases[i].active) {
        index = static_cast<int>(i);
        break;
      }
      const uint32_t age = millis() - leases[i].touchedAt;
      if (age >= oldestAge) {
        oldestAge = age;
        index = static_cast<int>(i);
      }
    }
  }
  leases[index].active = true;
  memcpy(leases[index].mac, mac, 6);
  leases[index].ipLastOctet = lastOctet;
  leases[index].touchedAt = millis();
}

uint8_t chooseAddress(const uint8_t* mac, const uint8_t* requested) {
  const int reserved = reservationByMac(mac);
  if (reserved >= 0) return reservations[reserved].ipLastOctet;

  const int existing = leaseByMac(mac);
  if (existing >= 0 &&
      leases[existing].ipLastOctet >= kDynamicIpFirst &&
      leases[existing].ipLastOctet <= kDynamicIpLast &&
      !ipUsedByOtherMac(leases[existing].ipLastOctet, mac)) {
    return leases[existing].ipLastOctet;
  }

  if (requested && requested[0] == 192 && requested[1] == 168 &&
      requested[2] == 4 && requested[3] >= kDynamicIpFirst &&
      requested[3] <= kDynamicIpLast && !ipUsedByOtherMac(requested[3], mac)) {
    return requested[3];
  }

  for (uint8_t last = kDynamicIpFirst; last <= kDynamicIpLast; ++last) {
    if (!ipUsedByOtherMac(last, mac)) return last;
  }
  return 0;
}

bool getOption(const DhcpPacket& packet, uint8_t code, uint8_t* value,
               size_t capacity, size_t* valueLength) {
  size_t cursor = 0;
  while (cursor < sizeof(packet.options)) {
    const uint8_t option = packet.options[cursor++];
    if (option == 255) break;
    if (option == 0) continue;
    if (cursor >= sizeof(packet.options)) break;
    const size_t length = packet.options[cursor++];
    if (length > sizeof(packet.options) - cursor) break;
    if (option == code) {
      if (length > capacity) return false;
      memcpy(value, &packet.options[cursor], length);
      *valueLength = length;
      return true;
    }
    cursor += length;
  }
  return false;
}

void appendOption(DhcpPacket& packet, size_t* cursor, uint8_t code,
                  const uint8_t* data, uint8_t length) {
  packet.options[(*cursor)++] = code;
  packet.options[(*cursor)++] = length;
  memcpy(&packet.options[*cursor], data, length);
  *cursor += length;
}

void sendDhcpReply(const DhcpPacket& request, uint8_t messageType,
                   uint8_t lastOctet, const IPAddress& remoteIp) {
  DhcpPacket response = request;
  response.op = 2;
  if (messageType == 6) memset(response.ciaddr, 0, sizeof(response.ciaddr));
  memset(response.yiaddr, 0, sizeof(response.yiaddr));
  if (lastOctet != 0) {
    response.yiaddr[0] = 192;
    response.yiaddr[1] = 168;
    response.yiaddr[2] = 4;
    response.yiaddr[3] = lastOctet;
  }
  response.siaddr[0] = 192;
  response.siaddr[1] = 168;
  response.siaddr[2] = 4;
  response.siaddr[3] = 1;
  memcpy(response.cookie, kDhcpCookie, sizeof(kDhcpCookie));
  memset(response.options, 0, sizeof(response.options));

  size_t optionCursor = 0;
  const uint8_t msg[] = {messageType};
  const uint8_t serverId[] = {192, 168, 4, 1};
  const uint8_t subnet[] = {255, 255, 255, 0};
  const uint8_t router[] = {192, 168, 4, 1};
  const uint8_t lease[] = {
      static_cast<uint8_t>(kLeaseSeconds >> 24),
      static_cast<uint8_t>(kLeaseSeconds >> 16),
      static_cast<uint8_t>(kLeaseSeconds >> 8),
      static_cast<uint8_t>(kLeaseSeconds)};

  appendOption(response, &optionCursor, 53, msg, sizeof(msg));
  appendOption(response, &optionCursor, 54, serverId, sizeof(serverId));
  if (messageType != 6) {
    appendOption(response, &optionCursor, 51, lease, sizeof(lease));
    appendOption(response, &optionCursor, 1, subnet, sizeof(subnet));
    appendOption(response, &optionCursor, 3, router, sizeof(router));
  }
  response.options[optionCursor++] = 255;

  const size_t encodedLength = offsetof(DhcpPacket, options) + optionCursor;
  // BOOTP/DHCP clients commonly expect at least the RFC 2131 minimum size.
  const size_t packetLength = encodedLength < 300 ? 300 : encodedLength;
  const IPAddress broadcast(255, 255, 255, 255);
  const IPAddress target = (messageType == 6 || remoteIp[0] == 0) ? broadcast : remoteIp;
  if (dhcpUdp.beginPacket(target, 68)) {
    dhcpUdp.write(reinterpret_cast<const uint8_t*>(&response), packetLength);
    dhcpUdp.endPacket();
  }
}

void handleDhcp() {
  const int packetSize = dhcpUdp.parsePacket();
  if (packetSize < static_cast<int>(offsetof(DhcpPacket, options) + 4)) return;

  DhcpPacket request = {};
  const int bytesRead = dhcpUdp.read(reinterpret_cast<uint8_t*>(&request),
                                     min(packetSize, static_cast<int>(sizeof(request))));
  if (bytesRead < static_cast<int>(offsetof(DhcpPacket, options) + 4) ||
      request.op != 1 || request.htype != 1 || request.hlen != 6 ||
      memcmp(request.cookie, kDhcpCookie, sizeof(kDhcpCookie)) != 0) {
    return;
  }

  uint8_t typeData[4] = {};
  size_t typeLength = 0;
  if (!getOption(request, 53, typeData, sizeof(typeData), &typeLength) ||
      typeLength != 1) return;

  uint8_t requestedIp[4] = {};
  size_t requestedLength = 0;
  const bool hasRequestedIp = getOption(request, 50, requestedIp,
                                        sizeof(requestedIp), &requestedLength) &&
                              requestedLength == 4;

  uint8_t serverId[4] = {};
  size_t serverLength = 0;
  if (getOption(request, 54, serverId, sizeof(serverId), &serverLength) &&
      serverLength == 4 &&
      (serverId[0] != 192 || serverId[1] != 168 ||
       serverId[2] != 4 || serverId[3] != 1)) {
    return;  // Client selected a different DHCP server.
  }

  const uint8_t messageType = typeData[0];
  const uint8_t* mac = request.chaddr;
  const IPAddress remoteIp = dhcpUdp.remoteIP();

  if (messageType == 1) {  // DHCPDISCOVER -> DHCPOFFER
    const uint8_t assigned = chooseAddress(mac, hasRequestedIp ? requestedIp : nullptr);
    if (assigned == 0) return;
    rememberLease(mac, assigned);
    sendDhcpReply(request, 2, assigned, remoteIp);
    return;
  }

  if (messageType == 3) {  // DHCPREQUEST -> DHCPACK or DHCPNAK
    uint8_t requested[4] = {};
    bool hasTarget = hasRequestedIp;
    if (hasRequestedIp) memcpy(requested, requestedIp, 4);
    else if (memcmp(request.ciaddr, "\0\0\0\0", 4) != 0) {
      memcpy(requested, request.ciaddr, 4);
      hasTarget = true;
    }

    const int reservation = reservationByMac(mac);
    const uint8_t assigned = chooseAddress(mac, hasTarget ? requested : nullptr);
    const bool targetMatches = !hasTarget ||
        (requested[0] == 192 && requested[1] == 168 && requested[2] == 4 &&
         requested[3] == assigned);
    if (assigned == 0 || !targetMatches ||
        (reservation >= 0 && assigned != reservations[reservation].ipLastOctet) ||
        ipUsedByOtherMac(assigned, mac)) {
      sendDhcpReply(request, 6, 0, remoteIp);
      return;
    }

    rememberLease(mac, assigned);
    sendDhcpReply(request, 5, assigned, remoteIp);
    return;
  }

  if (messageType == 7) {  // DHCPRELEASE
    const int lease = leaseByMac(mac);
    if (lease >= 0 && reservationByMac(mac) < 0) leases[lease].active = false;
  }
}

bool requireAdmin() {
  if (web.authenticate(kAdminUser, adminPassword)) return true;
  web.requestAuthentication(BASIC_AUTH, "AccessLock AP administration");
  return false;
}

String assignedIpForMac(const uint8_t* mac) {
  const int reserved = reservationByMac(mac);
  if (reserved >= 0) return String("192.168.4.") + reservations[reserved].ipLastOctet;
  const int lease = leaseByMac(mac);
  if (lease >= 0) return String("192.168.4.") + leases[lease].ipLastOctet;
  return "Awaiting DHCP";
}

String renderPage() {
  String page;
  page.reserve(5000);
  page += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>");
  page += F("<title>AccessLock AP</title><style>body{font:16px system-ui;max-width:850px;margin:28px auto;padding:0 16px;color:#182230;background:#f4f7fb}h1{font-size:25px}.card{background:white;padding:18px;margin:14px 0;border-radius:12px;box-shadow:0 2px 12px #10203012}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:9px;border-bottom:1px solid #e4e9f0}input{padding:10px;border:1px solid #bbc5d1;border-radius:7px;max-width:100%}button{padding:9px 13px;border:0;border-radius:7px;background:#a71930;color:white;font-weight:600}small,.muted{color:#5c6978}label{display:block;margin:10px 0 5px}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.danger{background:#6c7785}</style></head><body>");
  page += F("<h1>AccessLock local network</h1><p class='muted'>AP: AccessLock-Demo · Gateway: 192.168.4.1 · DHCP pool: 192.168.4.20–30</p>");
  page += F("<div class='card'><h2>Connected devices</h2><table><tr><th>MAC address</th><th>Current / reserved IP</th></tr>");

  wifi_sta_list_t stations = {};
  if (esp_wifi_ap_get_sta_list(&stations) == ESP_OK) {
    for (int i = 0; i < stations.num; ++i) {
      const String mac = macToString(stations.sta[i].mac);
      page += F("<tr><td><code>");
      page += mac;
      page += F("</code></td><td>");
      page += assignedIpForMac(stations.sta[i].mac);
      page += F("</td></tr>");
    }
  }
  page += F("</table><small>Connect a device to this Wi-Fi first so its MAC appears here.</small></div>");

  page += F("<div class='card'><h2>Reserve an address</h2><p class='muted'>Reservations bind a device MAC to an address in 192.168.4.2–19. Dynamic DHCP clients receive 192.168.4.20–30.</p><form method='post' action='/reserve'><div class='row'><div><label>Device name</label><input name='label' maxlength='23' required placeholder='Demo phone A'></div><div><label>Wi-Fi MAC</label><input id='mac' name='mac' maxlength='17' required placeholder='AA:BB:CC:DD:EE:FF'></div><div><label>Reserved last octet (2–19)</label><input name='ip' type='number' min='2' max='19' required placeholder='10'></div><button type='submit'>Save reservation</button></div></form></div>");

  page += F("<div class='card'><h2>Saved reservations</h2><table><tr><th>Name</th><th>MAC</th><th>Reserved IP</th><th></th></tr>");
  bool any = false;
  for (const auto& entry : reservations) {
    if (!entry.active) continue;
    any = true;
    page += F("<tr><td>");
    page += htmlEscape(String(entry.label));
    page += F("</td><td><code>");
    page += macToString(entry.mac);
    page += F("</code></td><td>192.168.4.");
    page += String(entry.ipLastOctet);
    page += F("</td><td><form method='post' action='/delete'><input type='hidden' name='mac' value='");
    page += macToString(entry.mac);
    page += F("'><button class='danger' type='submit'>Remove</button></form></td></tr>");
  }
  if (!any) page += F("<tr><td colspan='4'>No reservations saved yet.</td></tr>");
  page += F("</table><p class='muted'>Saved in ESP32 Preferences (NVS), so reservations survive reboot. A device may need to disconnect/reconnect or renew DHCP to use a changed reservation.</p></div>");
  page += F("<p class='muted'>Demo-only HTTP admin page on the isolated AP. No internet routing is provided.</p></body></html>");
  return page;
}

bool validLabel(const String& label) {
  if (label.length() == 0 || label.length() > 23) return false;
  for (size_t i = 0; i < label.length(); ++i) {
    const char c = label[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == ' ' || c == '-' || c == '_' || c == '.')) return false;
  }
  return true;
}

void setupWeb() {
  web.on("/", HTTP_GET, []() {
    if (!requireAdmin()) return;
    web.sendHeader("Cache-Control", "no-store");
    web.send(200, "text/html; charset=utf-8", renderPage());
  });

  web.on("/reserve", HTTP_POST, []() {
    if (!requireAdmin()) return;
    uint8_t mac[6];
    const String label = web.arg("label");
    const String macText = web.arg("mac");
    const long ipLast = web.arg("ip").toInt();
    if (!parseMac(macText, mac) || !validLabel(label) ||
        ipLast < kReservationIpFirst || ipLast > kReservationIpLast) {
      web.send(400, "text/plain", "Invalid name, MAC address, or reserved IP range.");
      return;
    }

    const int conflictingIp = reservationByIp(static_cast<uint8_t>(ipLast));
    if (conflictingIp >= 0 && !macEqual(reservations[conflictingIp].mac, mac)) {
      web.send(409, "text/plain", "That IP is already reserved for another MAC address.");
      return;
    }

    int slot = reservationByMac(mac);
    if (slot < 0) {
      for (uint8_t i = 0; i < kReservationCapacity; ++i) {
        if (!reservations[i].active) { slot = i; break; }
      }
    }
    if (slot < 0) {
      web.send(409, "text/plain", "Reservation table is full.");
      return;
    }

    Reservation& entry = reservations[slot];
    memset(&entry, 0, sizeof(entry));
    entry.active = 1;
    memcpy(entry.mac, mac, sizeof(mac));
    entry.ipLastOctet = static_cast<uint8_t>(ipLast);
    strlcpy(entry.label, label.c_str(), sizeof(entry.label));
    if (!saveReservations()) {
      web.send(500, "text/plain", "Could not save reservation to Preferences.");
      return;
    }
    web.sendHeader("Location", "/");
    web.send(303, "text/plain", "Reservation saved. Reconnect the device to renew its lease.");
  });

  web.on("/delete", HTTP_POST, []() {
    if (!requireAdmin()) return;
    uint8_t mac[6];
    if (!parseMac(web.arg("mac"), mac)) {
      web.send(400, "text/plain", "Invalid MAC address.");
      return;
    }
    const int slot = reservationByMac(mac);
    if (slot >= 0) memset(&reservations[slot], 0, sizeof(reservations[slot]));
    if (!saveReservations()) {
      web.send(500, "text/plain", "Could not save Preferences.");
      return;
    }
    web.sendHeader("Location", "/");
    web.send(303, "text/plain", "Reservation removed.");
  });
  web.onNotFound([]() { web.send(404, "text/plain", "Not found"); });
  web.begin();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(600);
  Serial.println();
  Serial.println("AccessLock local demo AP with DHCP reservations");
  Serial.println("No WAN, NAT, or lock actuation; demo-only HTTP admin UI.");
  readSecret("Enter Wi-Fi AP passphrase", apPassword, sizeof(apPassword));
  readSecret("Enter separate web admin password (username: admin)",
             adminPassword, sizeof(adminPassword));

  loadReservations();
  WiFi.persistent(false);
  WiFi.mode(WIFI_AP);
  if (!WiFi.softAPConfig(kApIp, kApIp, kSubnet)) {
    Serial.println("ERROR: Could not configure AP address.");
    while (true) delay(1000);
  }
  if (!WiFi.softAP(kSsid, apPassword, kChannel, false, kMaxStations)) {
    Serial.println("ERROR: Could not start Wi-Fi AP.");
    while (true) delay(1000);
  }
  memset(apPassword, 0, sizeof(apPassword));

  esp_netif_t* apNetif = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
  if (!apNetif) {
    Serial.println("ERROR: Could not find AP network interface.");
    while (true) delay(1000);
  }
  const esp_err_t dhcpStop = esp_netif_dhcps_stop(apNetif);
  if (dhcpStop != ESP_OK && dhcpStop != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STOPPED) {
    Serial.printf("ERROR: Could not stop built-in DHCP server: %s\n", esp_err_to_name(dhcpStop));
    while (true) delay(1000);
  }
  if (!dhcpUdp.begin(67)) {
    Serial.println("ERROR: Could not start reservation-aware DHCP service on UDP/67.");
    while (true) delay(1000);
  }

  setupWeb();
  Serial.printf("SSID: %s\n", kSsid);
  Serial.printf("AP address/admin page: http://%s/\n", WiFi.softAPIP().toString().c_str());
  Serial.printf("AP MAC: %s\n", WiFi.softAPmacAddress().c_str());
  Serial.printf("Stations: up to %u\n", kMaxStations);
  Serial.printf("Reserved range: 192.168.4.%u-%u; DHCP pool: 192.168.4.%u-%u\n",
                kReservationIpFirst, kReservationIpLast,
                kDynamicIpFirst, kDynamicIpLast);
  Serial.println("Admin page credentials: username admin, separate password entered at boot.");
}

void loop() {
  web.handleClient();
  handleDhcp();
  delay(2);
}
