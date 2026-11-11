include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Xray (Lite backend mode)
LUCI_DEPENDS:=+luci-base +xray-core
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-xray-lite
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=ganganray

LUCI_MINIFY_LUA:=0
LUCI_MINIFY_CSS:=0
LUCI_MINIFY_JS:=0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
