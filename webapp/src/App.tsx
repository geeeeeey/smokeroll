import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createOrder, getProducts } from "./api";
import type { Product } from "./types";
import { useTheme } from "./theme";
import SmokeRollLogo from "./assets/smokeroll-logo.svg";

declare global {
  interface Window {
    Telegram?: any;
  }
}

function rub(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

type Category = "Все" | "Вейпы" | "Жидкости" | "Испарители" | "Картриджи" | "Другое";
const CATEGORIES: Category[] = ["Все", "Вейпы", "Жидкости", "Испарители", "Картриджи"];

function inferCategory(title: string): Category {
  const t = title.toLowerCase();
  if (t.includes("жидк")) return "Жидкости";
  if (t.includes("испар")) return "Испарители";
  if (t.includes("картридж") || t.includes("карт")) return "Картриджи";
  if (t.includes("vape") || t.includes("xross") || t.includes("pasito")) return "Вейпы";
  return "Другое";
}

export default function App() {
  const tg = window.Telegram?.WebApp;
  const { theme, toggleTheme } = useTheme();

  const [ageOk, setAgeOk] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Все");
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
  }, [tg]);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      setProducts(await getProducts());
    } catch {
      setError("Не удалось загрузить каталог. Проверь, что backend запущен и VITE_API_URL=http://localhost:3000");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  const total = useMemo(() => {
    return Object.entries(cart).reduce((sum, [idStr, qty]) => {
      const p = byId.get(Number(idStr));
      return p ? sum + p.price * qty : sum;
    }, 0);
  }, [cart, byId]);

  const cartCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  const priceBounds = useMemo(() => {
    const prices = products.map((p) => p.price).filter((n) => Number.isFinite(n));
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    return { min, max };
  }, [products]);

  useEffect(() => {
    if (products.length && (priceMin === null || priceMax === null)) {
      setPriceMin(priceBounds.min);
      setPriceMax(priceBounds.max);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length, priceBounds.min, priceBounds.max]);

  useEffect(() => {
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
      setPriceMin(priceMax);
    }
  }, [priceMin, priceMax]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minVal = priceMin ?? priceBounds.min;
    const maxVal = priceMax ?? priceBounds.max;

    return products.filter((p) => {
      const cat = inferCategory(p.title);
      const inCat = category === "Все" ? true : cat === category;
      const inQuery = q ? p.title.toLowerCase().includes(q) : true;
      const minOk = p.price >= minVal;
      const maxOk = p.price <= maxVal;
      return inCat && inQuery && minOk && maxOk;
    });
  }, [products, query, category, priceMin, priceMax, priceBounds.min, priceBounds.max]);

  const add = (p: Product) => {
    setCart((prev) => {
      const cur = prev[p.id] || 0;
      if (cur >= p.stock) return prev;
      return { ...prev, [p.id]: cur + 1 };
    });
  };

  const remove = (p: Product) => {
    setCart((prev) => {
      const cur = prev[p.id] || 0;
      if (cur <= 1) {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      }
      return { ...prev, [p.id]: cur - 1 };
    });
  };

  const setQty = (productId: number, next: number) => {
    const p = byId.get(productId);
    if (!p) return;

    const clamped = Math.max(0, Math.min(next, p.stock));
    setCart((prev) => {
      if (clamped <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: clamped };
    });
  };

  const checkout = async () => {
    if (busy) return;

    const items = Object.entries(cart).map(([productId, qty]) => ({
      productId: Number(productId),
      qty,
    }));
    if (items.length === 0) return;

    const user = tg?.initDataUnsafe?.user;
    const tgUserId = user?.id ? String(user.id) : "0";
    const tgUsername = user?.username;

    try {
      setBusy(true);
      await createOrder({ tgUserId, tgUsername, items });
      tg?.showAlert?.("Заказ отправлен ✅ Я свяжусь с вами в этом чате.");
      setCart({});
      await refresh();
    } catch {
      tg?.showAlert?.("Не удалось оформить заказ. Возможно, товар закончился.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!ageOk) {
    return (
      <div style={styles.page}>
        <style>{numberSpinnerCss}</style>

        <div style={{ ...styles.card, maxWidth: 520 }}>
          <div style={styles.headerRow}>
            <h2 style={styles.h2}>18+</h2>
            <button style={styles.ghostBtn} onClick={toggleTheme} aria-label="toggle theme">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>

          <p style={styles.p}>Нажимая “Мне 18+”, вы подтверждаете, что вам исполнилось 18 лет.</p>

          <button style={styles.primaryBtn} onClick={() => setAgeOk(true)}>
            ✅ Мне 18+
          </button>

          <p style={{ ...styles.p, fontSize: 12, opacity: 0.7, marginTop: 12 }}>
            Этот магазин — технический шаблон. Соблюдайте законы вашей страны.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{numberSpinnerCss}</style>

      <div style={{ width: "100%", maxWidth: 720 }}>
        {/* Top Bar */}
        <div style={styles.topBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={SmokeRollLogo} alt="SmokeRoll" style={styles.logo} />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <div style={styles.brand}>SmokeRoll</div>
              <div style={styles.brandSub}>Мини-магазин • быстрый заказ в Telegram</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              style={{ ...styles.ghostBtn, position: "relative" }}
              onClick={() => setCartOpen(true)}
              aria-label="cart"
            >
              🛒
              {cartCount > 0 && <span style={styles.badge}>{cartCount}</span>}
            </button>

            <button style={styles.ghostBtn} onClick={toggleTheme} aria-label="toggle theme">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button
              style={{
                ...styles.ghostBtn,
                ...(theme === "dark" ? styles.ghostBtnOnDark : {}),
                ...((loading || busy) ? styles.btnDisabled : {}),
              }}
              onClick={refresh}
              disabled={loading || busy}
            >
              Обновить
            </button>
          </div>
        </div>

        {/* Banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={styles.banner}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={styles.bannerIcon}>⚡</div>
            <div>
              <div style={styles.bannerTitle}>Быстрый заказ</div>
              <div style={styles.bannerText}>Выбирай товары — заказ прилетит владельцу в Telegram.</div>
            </div>
          </div>

          <div style={styles.bannerPills}>
            <span style={styles.pill}>Вейпы</span>
            <span style={styles.pill}>Жидкости</span>
            <span style={styles.pill}>Испарители</span>
          </div>
        </motion.div>

        {/* Search + Filters */}
        <div style={styles.filterCard}>
          <div style={styles.searchRow}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по товарам…"
              style={styles.searchInput}
            />
            <button style={styles.smallBtn} onClick={() => setQuery("")} disabled={!query}>
              ✕
            </button>
          </div>

          <div style={styles.chipsRow}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                style={{ ...styles.chip, ...(category === c ? styles.chipActive : {}) }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Price */}
          <div style={styles.priceRow}>
            <div style={styles.priceLabel}>Цена (₽)</div>

            <div style={styles.priceInputsRow}>
              <div style={styles.moneyField}>
                <span style={styles.moneyPrefix}>от</span>
                <input
                  className="sr-number"
                  type="number"
                  inputMode="numeric"
                  value={priceMin ?? ""}
                  placeholder={String(priceBounds.min)}
                  min={priceBounds.min}
                  max={priceBounds.max}
                  onChange={(e) => setPriceMin(e.target.value === "" ? null : Number(e.target.value))}
                  style={styles.moneyInput}
                />
                <span style={styles.moneySuffix}>₽</span>
              </div>

              <div style={styles.moneyField}>
                <span style={styles.moneyPrefix}>до</span>
                <input
                  className="sr-number"
                  type="number"
                  inputMode="numeric"
                  value={priceMax ?? ""}
                  placeholder={String(priceBounds.max)}
                  min={priceBounds.min}
                  max={priceBounds.max}
                  onChange={(e) => setPriceMax(e.target.value === "" ? null : Number(e.target.value))}
                  style={styles.moneyInput}
                />
                <span style={styles.moneySuffix}>₽</span>
              </div>

              <button
                style={styles.smallBtn}
                onClick={() => {
                  setPriceMin(priceBounds.min);
                  setPriceMax(priceBounds.max);
                }}
              >
                Сброс
              </button>
            </div>

            <div style={styles.presetsRow}>
              {[500, 1000, 2000, 3000].map((n) => (
                <button
                  key={n}
                  style={styles.presetBtn}
                  onClick={() => {
                    setPriceMin(priceBounds.min);
                    setPriceMax(Math.min(n, priceBounds.max));
                  }}
                >
                  до {n} ₽
                </button>
              ))}
              <button
                style={styles.presetBtn}
                onClick={() => {
                  setPriceMin(priceBounds.min);
                  setPriceMax(priceBounds.max);
                }}
              >
                все
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Диапазон: {priceBounds.min} – {priceBounds.max} ₽
            </div>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {loading ? (
          <div style={styles.p}>Загрузка…</div>
        ) : (
          <motion.div layout style={{ display: "grid", gap: 12 }}>
            {filteredProducts.map((p) => {
              const qty = cart[p.id] || 0;
              const disabled = p.stock === 0;

              return (
                <motion.div
                  layout
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  style={{ ...styles.card, opacity: disabled ? 0.6 : 1 }}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.title} style={styles.image} loading="lazy" />
                  ) : (
                    <div style={styles.imagePlaceholder}>SmokeRoll</div>
                  )}

                  <div style={styles.cardBody}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.titleRow}>
                        <div style={styles.title}>{p.title}</div>
                        <span style={styles.catTag}>{inferCategory(p.title)}</span>
                      </div>
                      <div style={styles.price}>{rub(p.price)}</div>
                      <div style={styles.stock}>Осталось: {p.stock}</div>
                    </div>

                    <div style={styles.stepper}>
                      <button
                        style={styles.stepBtn}
                        onClick={() => remove(p)}
                        disabled={qty === 0 || disabled}
                        aria-label="minus"
                      >
                        −
                      </button>

                      <AnimatePresence mode="popLayout">
                        <motion.div
                          key={qty}
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                          style={styles.qty}
                        >
                          {qty}
                        </motion.div>
                      </AnimatePresence>

                      <button
                        style={styles.stepBtn}
                        onClick={() => add(p)}
                        disabled={disabled || qty >= p.stock}
                        aria-label="plus"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Bottom + Cart Modal */}
        <div style={styles.bottomBarWrap}>
          <AnimatePresence>
            {cartOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.modalBackdrop}
                onClick={() => setCartOpen(false)}
              >
                <motion.div
                  initial={{ y: 24, opacity: 0, scale: 0.98 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 24, opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  style={styles.modal}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={styles.modalHeader}>
                    <div style={styles.modalTitle}>Корзина</div>
                    <button style={styles.ghostBtn} onClick={() => setCartOpen(false)}>
                      ✕
                    </button>
                  </div>

                  {cartCount === 0 ? (
                    <div style={{ ...styles.p, opacity: 0.8 }}>
                      Пока пусто. Добавь товары кнопкой “+”.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {products
                        .filter((p) => (cart[p.id] || 0) > 0)
                        .map((p) => {
                          const qty = cart[p.id] || 0;
                          return (
                            <div key={p.id} style={styles.cartRow}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ ...styles.title, fontSize: 14, marginBottom: 2 }}>
                                  {p.title}
                                </div>
                                <div style={{ ...styles.p, margin: 0 }}>
                                  {rub(p.price)} × {qty} = <b>{rub(p.price * qty)}</b>
                                </div>
                              </div>

                              <div style={styles.stepper}>
                                <button style={styles.stepBtn} onClick={() => setQty(p.id, qty - 1)} disabled={busy}>
                                  –
                                </button>
                                <div style={styles.qty}>{qty}</div>
                                <button style={styles.stepBtn} onClick={() => setQty(p.id, qty + 1)} disabled={busy}>
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  <div style={styles.modalFooter}>
                    <div style={{ fontWeight: 800 }}>Итого: {rub(total)}</div>
                    <button style={styles.primaryBtn} onClick={checkout} disabled={busy || total === 0}>
                      Оформить
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={styles.bottomBar}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Итого</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{rub(total)}</div>
            </div>
            <button style={{ ...styles.primaryBtn, minWidth: 140 }} onClick={checkout} disabled={busy || total === 0}>
              {busy ? "Оформление…" : "Оформить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const numberSpinnerCss = `
  input.sr-number { appearance: textfield; -moz-appearance: textfield; }
  input.sr-number::-webkit-outer-spin-button,
  input.sr-number::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
`;

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    background: "var(--app-bg)",
    color: "var(--app-text)",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  h2: { margin: 0 },
  p: { margin: 0, lineHeight: 1.4 },
  card: {
    border: "1px solid var(--app-border)",
    borderRadius: 16,
    background: "var(--app-card)",
    overflow: "hidden",
    boxShadow: "var(--app-shadow)",
  },
  image: { width: "100%", height: 170, objectFit: "cover" },
  imagePlaceholder: {
    width: "100%",
    height: 170,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    opacity: 0.7,
    borderBottom: "1px dashed var(--app-border-strong)",
  },
  cardBody: { display: "flex", gap: 12, padding: 14, alignItems: "center" },
  title: { fontWeight: 800, fontSize: 16 },
  price: { marginTop: 6, fontWeight: 700 },
  stock: { marginTop: 6, fontSize: 12, opacity: 0.75 },
  stepper: { display: "flex", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: "1px solid var(--app-border-strong)",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    color: "var(--app-text)",
  },
  qty: { minWidth: 22, textAlign: "center", fontWeight: 800 },
  bottomBarWrap: { position: "sticky", bottom: 0, paddingTop: 12, marginTop: 16 },
  bottomBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    border: "1px solid var(--app-border)",
    background: "var(--app-card)",
    boxShadow: "var(--app-shadow-strong)",
  },
  primaryBtn: {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    fontWeight: 800,
    background: "var(--app-btn)",
    color: "var(--app-btn-text)",
  },
  ghostBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--app-border-strong)",
    background: "transparent",
    cursor: "pointer",
    color: "var(--app-text)",
  },
  ghostBtnOnDark: {
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.06)",
  },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  error: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid var(--app-danger-border)",
    background: "var(--app-danger-bg)",
    color: "var(--app-danger-text)",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  logo: { width: 34, height: 34, borderRadius: 10 },
  brand: { fontSize: 18, fontWeight: 800, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, opacity: 0.75 },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    background: "var(--app-accent)",
    color: "white",
    borderRadius: 999,
    padding: "2px 6px",
    fontSize: 11,
    fontWeight: 800,
    border: "2px solid var(--app-card)",
  },
  banner: {
    background: "linear-gradient(135deg, rgba(255,45,45,0.18), rgba(255,107,45,0.10))",
    border: "1px solid var(--app-border)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,45,45,0.20)",
    border: "1px solid rgba(255,45,45,0.35)",
    fontSize: 18,
  },
  bannerTitle: { fontWeight: 800, marginBottom: 2 },
  bannerText: { fontSize: 12, opacity: 0.85 },
  bannerPills: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  pill: {
    fontSize: 11,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--app-border)",
    background: "rgba(255,255,255,0.04)",
  },
  filterCard: {
    border: "1px solid var(--app-border)",
    background: "var(--app-card)",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
  },
  searchRow: { display: "flex", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid var(--app-border)",
    background: "transparent",
    color: "var(--app-text)",
    outline: "none",
    fontSize: 14,
  },
  smallBtn: {
    border: "1px solid var(--app-border)",
    background: "transparent",
    color: "var(--app-text)",
    padding: "10px 12px",
    borderRadius: 14,
    cursor: "pointer",
  },
  chipsRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  chip: {
    border: "1px solid var(--app-border)",
    background: "transparent",
    color: "var(--app-text)",
    padding: "8px 10px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 12,
  },
  chipActive: {
    background: "rgba(255,45,45,0.15)",
    border: "1px solid rgba(255,45,45,0.5)",
  },
  priceRow: { marginTop: 10, display: "grid", gap: 8 },
  priceLabel: { fontSize: 12, opacity: 0.85 },
  priceInputsRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  moneyField: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid var(--app-border-strong)",
    background: "rgba(255,255,255,0.03)",
  },
  moneyPrefix: { fontSize: 12, opacity: 0.75, fontWeight: 700 },
  moneySuffix: { fontSize: 12, opacity: 0.75, fontWeight: 800 },
  moneyInput: {
    width: 84,
    border: "none",
    background: "transparent",
    color: "var(--app-text)",
    outline: "none",
    fontSize: 14,
    fontWeight: 800,
  },
  presetsRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  presetBtn: {
    border: "1px solid var(--app-border)",
    background: "transparent",
    color: "var(--app-text)",
    padding: "8px 10px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 12,
  },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  catTag: {
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid var(--app-border)",
    opacity: 0.9,
    whiteSpace: "nowrap",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "end center",
    padding: 12,
    zIndex: 50,
  },
  modal: {
    width: "100%",
    maxWidth: 720,
    background: "var(--app-card)",
    border: "1px solid var(--app-border)",
    borderRadius: 18,
    padding: 12,
    boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: 800 },
  cartRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    border: "1px solid var(--app-border)",
  },
  modalFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 },
};
