# Fork personal de omarchy-vpn

Fork de [jkoestinger/omarchy-vpn](https://github.com/jkoestinger/omarchy-vpn) con dos cambios encima de upstream:

- **Fortinet SSL VPN**: reconoce perfiles de NetworkManager del plugin `networkmanager-fortisslvpn` (que usa `openfortivpn`). Upstream los descarta en silencio.
- **Cancelar conexión en curso**: el botón de desconectar funciona mientras la VPN aún está "activating". Antes no hacía nada.

Se ha dejado este fichero aparte del `README.md` para no chocar con upstream al sincronizar.

## Instalar en un ordenador nuevo

```bash
# Si ya tienes el plugin original instalado
omarchy plugin remove jkoestinger.vpn

omarchy plugin add https://github.com/albertreig/omarchy-vpn.git --enable
```

## Requisitos

Todo lo siguiente ya viene con Omarchy salvo el plugin de FortiSSL:

- Omarchy con su shell (Quickshell) y `nmcli` (paquete `networkmanager`).
- `git` para que `omarchy plugin add` clone el repo.

Solo para FortiSSL:

```bash
omarchy pkg aur add networkmanager-fortisslvpn
```

Sus dependencias (`openfortivpn`, `ppp`, `libnm`, `libsecret`) se instalan solas, no hace falta pedirlas aparte. El plugin solo detecta el perfil si existe `nm-fortisslvpn-service` (en `/usr/lib/NetworkManager/`).

Opcional, para crear el perfil con interfaz gráfica en vez de `nmcli`: `omarchy pkg add nm-connection-editor libnma-gtk4`. Con la GUI la contraseña también hay que dejarla guardada en el perfil (ver más abajo).

Solo para desarrollar: `node` (para `node tests/run.js`) y `qmllint` (opcional).

## Crear el perfil VPN

```bash
nmcli connection add type vpn vpn-type fortisslvpn ifname '*' con-name "MI_VPN" \
  vpn.data "gateway=HOST:PUERTO, user=USUARIO, trusted-cert=HUELLA_SHA256"
```

- `gateway`: incluye el puerto si no es el 443 (por ejemplo `vpn.ejemplo.com:10443`). Se pasa tal cual a `openfortivpn`.
- `trusted-cert`: solo hace falta si el FortiGate usa un certificado autofirmado. Si falta, el intento falla y `journalctl -u NetworkManager` imprime la línea `trusted-cert = ...` con la huella exacta.
- Comprobar que el puerto responde: `timeout 3 bash -c 'cat < /dev/null > /dev/tcp/HOST/PUERTO' && echo abierto`.

### Guardar la contraseña

`nmcli --ask` no funciona con este plugin: falla con `No valid secrets` / `final secrets request failed`. Hay que guardar la contraseña en el perfil, en modo interactivo para que no quede en el historial de bash:

```bash
nmcli connection edit MI_VPN
nmcli> set vpn.secrets password = TU_CONTRASEÑA
nmcli> save
nmcli> quit
```

Ojo: la propiedad es `vpn.secrets` con `password = valor` dentro. `set vpn.secrets.password` da error.

## Probar

```bash
nmcli connection up MI_VPN
```

O desde el icono VPN de la barra. Si el perfil no aparece, `omarchy restart shell`.

## Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| `No valid secrets` | Contraseña no guardada en el perfil (ver arriba) |
| `connect timeout exceeded` | Puerto incorrecto o bloqueado; probar el puerto con el comando de arriba |
| `Unknown reason` + error de certificado en el journal | Falta `trusted-cert` |
| El perfil no aparece en la barra | Falta `networkmanager-fortisslvpn`, o reiniciar el shell |

Logs detallados: `sudo nmcli general logging level DEBUG domains VPN`, y al terminar `sudo nmcli general logging level INFO domains VPN`.

## Sincronizar con upstream

```bash
git remote add upstream https://github.com/jkoestinger/omarchy-vpn.git   # una vez
git fetch upstream && git rebase upstream/main
node tests/run.js && omarchy plugin validate .
git push --force-with-lease origin main
omarchy restart shell
```

Los cambios de `model/*.js` requieren `omarchy restart shell` porque esos scripts se cachean.
