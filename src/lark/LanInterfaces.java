package lark;

import java.net.*;
import java.util.*;

/** Actual adapter metadata. A matching subnet is a hint, never a reachability test. */
final class LanInterfaces {
    static Json.Arr list() throws SocketException {
        List<Json.Obj> entries = new ArrayList<>();
        Enumeration<NetworkInterface> networks = NetworkInterface.getNetworkInterfaces();
        while (networks != null && networks.hasMoreElements()) {
            NetworkInterface network = networks.nextElement();
            boolean active = network.isUp(), loopback = network.isLoopback();
            String name = network.getDisplayName() == null ? network.getName() : network.getDisplayName();
            String lower = name.toLowerCase(Locale.ROOT);
            String type = loopback ? "Loopback" : lower.matches(".*(wi-fi|wifi|wireless|wlan).*" ) ? "Wi-Fi"
                    : network.isVirtual() ? "Virtual" : lower.matches(".*(ethernet|eth[0-9]|en[0-9]).*") ? "Ethernet" : "Network adapter";
            for (InterfaceAddress binding : network.getInterfaceAddresses()) {
                InetAddress ip = binding.getAddress();
                if (!(ip instanceof Inet4Address)) continue;
                boolean suitable = active && (loopback || ip.isSiteLocalAddress() || ip.isLinkLocalAddress());
                entries.add(new Json.Obj().put("name", network.getName()).put("displayName", name)
                        .put("address", ip.getHostAddress()).put("prefix", binding.getNetworkPrefixLength())
                        .put("type", type).put("loopback", loopback).put("active", active).put("suitable", suitable)
                        .put("recommended", suitable && !loopback && !network.isVirtual() && ip.isSiteLocalAddress()));
            }
        }
        entries.sort(Comparator.comparing((Json.Obj item) -> !item.bool("recommended")).thenComparing(item -> item.str("address")));
        Json.Arr result = new Json.Arr(); entries.forEach(result::add); return result;
    }
    static boolean sameSubnet(String a, String b, int prefix) {
        if (prefix < 0 || prefix > 32) return false;
        try {
            byte[] x = InetAddress.getByName(a).getAddress(), y = InetAddress.getByName(b).getAddress();
            if (x.length != 4 || y.length != 4) return false;
            for (int i = 0; i < 4; i++) {
                int bits = Math.min(8, Math.max(0, prefix - i * 8));
                int mask = bits == 0 ? 0 : 0xff << (8 - bits);
                if ((x[i] & mask) != (y[i] & mask)) return false;
            }
            return true;
        } catch (Exception e) { return false; }
    }
}
