package lark;
public final class LanInterfacesCheck {
 public static void main(String[] args) throws Exception {
  if (!LanInterfaces.sameSubnet("192.168.1.2", "192.168.1.200", 24)) throw new AssertionError();
  if (LanInterfaces.sameSubnet("192.168.1.2", "192.168.2.2", 24)) throw new AssertionError();
  if (!LanInterfaces.sameSubnet("10.2.3.4", "10.9.8.7", 8)) throw new AssertionError();
  if (LanInterfaces.sameSubnet("127.0.0.1", "127.0.0.2", 32)) throw new AssertionError();
  for (Json.Value v : LanInterfaces.list().values()) {
   Json.Obj item=(Json.Obj)v;
   if (item.str("name").isBlank() || item.str("address").isBlank() || !item.has("active") || !item.has("prefix")) throw new AssertionError();
  }
  System.out.println("LAN adapter metadata and subnet checks passed.");
 }
}
