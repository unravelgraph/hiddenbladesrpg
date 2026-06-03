function Blanket(name, factory) {
  const blankLog = "background:#6F50FB24; padding:10px;border-radius:5px";

  /**
   * CrÃ©e un petit gestionnaire de storage basÃ© sur localStorage, avec :
   * - cache mÃ©moire (Ã©vite les JSON.parse rÃ©pÃ©titifs)
   * - TTL (expiration logique)
   * - purge (suppression dÃ©finitive des entrÃ©es trop anciennes)
   *
   * Stockage attendu (par entrÃ©e) : { ...data, timestamp: number }
   *
   * @param {string} key - ClÃ© localStorage
   * @param {Object} [options]
   * @param {number|null} [options.ttl=null] - DurÃ©e de validitÃ©
   * @param {number|null} [options.purgeAfter=null] - Ã‚ge max en ms avant suppression dÃ©finitive (par dÃ©faut 1 mois si ttl)
   * @param {number} [options.purgeInterval=86400000] - Intervalle min entre deux purges
   * @returns {{
   *  get: (id: string|number) => any|null,
   *  getAll: () => Object,
   *  set: (id: string|number, value: Object) => void,
   *  remove: (id: string|number) => void,
   *  clear: () => void,
   *  flush: () => void
   * }}
   */
  function storage(key, options = {}) {
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    const { ttl = null, purgeAfter = ttl ? ONE_MONTH : null, purgeInterval = 24 * 60 * 60 * 1000 } = options;
    const LAST_PURGE_KEY = `${key}.__lastPurge`;

    // Memory cache (rÃ©duit les accÃ¨s sync Ã  localStorage + JSON.parse)
    let memory = null;
    let dirty = false;

    const now = () => Date.now();

    /** @returns {Object} */
    function read() {
      if (memory) return memory;

      try {
        memory = JSON.parse(localStorage.getItem(key)) || {};
      } catch {
        memory = {};
      }

      return memory;
    }

    /**
     * Ã‰crit le cache mÃ©moire dans localStorage si nÃ©cessaire
     */
    function flush() {
      if (!dirty || !memory) return;

      try {
        localStorage.setItem(key, JSON.stringify(memory));
      } catch {
        // pas de crash si quota dÃ©passÃ© / stockage interdit
      } finally {
        dirty = false;
      }
    }

    function write(data) {
      memory = data;
      dirty = true;
      // Ã©criture immÃ©diate pour garder ton comportement actuel
      flush();
    }

    /** @returns {boolean} */
    function shouldPurge() {
      if (!purgeAfter) return false;
      const last = Number(localStorage.getItem(LAST_PURGE_KEY) || 0);
      return now() - last > purgeInterval;
    }

    function purge(data) {
      if (!purgeAfter) return data;

      let modified = false;

      for (const k in data) {
        const entry = data[k];
        if (!entry?.timestamp || now() - entry.timestamp > purgeAfter) {
          delete data[k];
          modified = true;
        }
      }

      if (modified) write(data);

      try {
        localStorage.setItem(LAST_PURGE_KEY, String(now()));
      } catch {}

      return data;
    }

    /**
     * RÃ©cupÃ¨re une entrÃ©e du cache.
     * - Retourne null si absente
     * - Retourne null si expirÃ©e (TTL)
     *
     * @param {string|number} id
     * @returns {any|null}
     */
    function get(id) {
      const safeId = String(id ?? "").trim();
      if (!safeId) return null;

      let data = read();
      if (shouldPurge()) data = purge(data);

      const entry = data[safeId];
      if (!entry) return null;

      if (ttl && entry.timestamp && now() - entry.timestamp > ttl) return null;

      return entry;
    }

    /**
     * Ajoute/Ã©crase une entrÃ©e et met Ã  jour son timestamp.
     * @param {string|number} id
     * @param {Object} value
     */
    function set(id, value) {
      const safeId = String(id ?? "").trim();
      if (!safeId) return;

      const data = read();
      data[safeId] = { ...(value || {}), timestamp: now() };
      write(data);
    }

    /**
     * Supprime une entrÃ©e.
     * @param {string|number} id
     */
    function remove(id) {
      const safeId = String(id ?? "").trim();
      if (!safeId) return;

      const data = read();
      delete data[safeId];
      write(data);
    }

    /** Supprime tout le storage + meta purge */
    function clear() {
      memory = {};
      dirty = false;

      try {
        localStorage.removeItem(key);
        localStorage.removeItem(LAST_PURGE_KEY);
      } catch {}
    }

    /** @returns {Object} Retourne l'objet complet (non filtrÃ© TTL) */
    function getAll() {
      // Note: getAll ne filtre pas les entrÃ©es expirÃ©es, c'est volontaire
      return read();
    }

    return { get, getAll, set, remove, clear, flush };
  }

  const utils = {
    name,
    storage,
    /**
     * Log standard Blanket.
     * @param {string} message
     * @param {any} [data]
     */
    warn: function (message, data) {
      if (data !== undefined) console.log(`%cðŸ“¦ [BLANK : ${name}] ${message}`, blankLog, data);
      else console.log(`%cðŸ“¦ [BLANK : ${name}] ${message}`, blankLog);
    },

    get(selector, root = document, options = {}) {
      if (root && root.nodeType === undefined && typeof root === "object") {
        options = root;
        root = document;
      }

      const { required = true } = options;
      const warnIf = (msg) => required && utils.warn(msg);

      if (!root || !root.querySelector) {
        warnIf(`Ã‰lÃ©ment parent invalide pour le sÃ©lecteur "${selector}"`);
        return null;
      }

      const el = root.querySelector(selector);
      if (!el) warnIf(`Impossible de retrouver l'Ã©lÃ©ment "${selector}"`);

      return el;
    },

    getAll: function (selector, root = document) {
      if (!root || !root.querySelectorAll) {
        utils.warn(`Parent invalide pour le sÃ©lecteur "${selector}"`);
        return [];
      }
      return Array.from(root.querySelectorAll(selector));
    },

    ready: function (fn) {
      if (document.readyState !== "loading") fn();
      else document.addEventListener("DOMContentLoaded", fn);
    },

    attr: function (el, name, value) {
      if (!el) return null;
      if (value === undefined) return el.getAttribute(name);
      el.setAttribute(name, value);
    },

    toggleClass: function (el, className) {
      if (!el) return;
      el.classList.toggle(className);
    },

    createElement: function (tag, options = {}) {
      const element = document.createElement(tag);
      Object.entries(options).forEach(([key, value]) => {
        if (key === "class") element.className = value;
        else if (key === "text") element.textContent = value;
        else element.setAttribute(key, value);
      });
      return element;
    },

    mergeOptions: function (defaults, options) {
      const o = options && typeof options === "object" ? options : {};
      return Object.assign({}, defaults || {}, o);
    },

    isConnected: function () {
      return _userdata["session_logged_in"] === 1 ? true : false;
    },
    getUsername: function () {
      return _userdata["username"];
    },
    getUserId: function () {
      return _userdata["user_id"];
    },
    getAvatar: function () {
      return _userdata["avatar_link"];
    },
    getGroupColor: function () {
      return _userdata["groupcolor"];
    },

    createPopUp: function ({ button, panel }) {
      const buttonElement = document.querySelector(button);
      const panelElement = document.querySelector(panel);

      if (!buttonElement || !panelElement) {
        console.log(`%cðŸ“¦ [BLANK : ${name}] Impossible de crÃ©er le pop-up, Ã©lÃ©ment ${buttonElement ? panel : button} non trouvÃ©.`, blankLog);
        return;
      }

      function togglepanel() {
        buttonElement.classList.toggle("active");
        panelElement.classList.toggle("open");
      }

      function closepanel() {
        buttonElement.classList.remove("active");
        panelElement.classList.remove("open");
      }

      function handleClickOutside(event) {
        if (!buttonElement.contains(event.target) && !panelElement.contains(event.target) && panelElement.classList.contains("open")) {
          closepanel();
        }
      }

      buttonElement.addEventListener("click", togglepanel);
      document.addEventListener("click", handleClickOutside);
    },

    /**
     * Parse du HTML en Document
     * @param {string} html
     * @returns {Document}
     */
    parseHTML: function (html) {
      return new DOMParser().parseFromString(html, "text/html");
    },

    /**
     * RÃ©cupÃ¨re l'ID utilisateur Ã  partir d'une URL /u<ID>
     * @param {string} url - L'URL Ã  partir de laquelle extraire l'ID utilisateur
     * @returns {number|null} L'ID utilisateur ou null si non trouvÃ©
     */
    getUserIDFromUrl: function (url) {
      try {
        const path = new URL(url, window.location.origin).pathname;
        const match = path.match(/\/u(\d+)(?:-|\/|$)/);
        return match ? parseInt(match[1], 10) : null;
      } catch (err) {
        utils.warn("Impossible de rÃ©cupÃ©rer l'ID utilisateur", err);
        return null;
      }
    },

    /**
     * RÃ©cupÃ¨re l'avatar + la couleur de pseudo d'un utilisateur via sa page profil (/u<ID>),
     * avec cache localStorage partagÃ© entre plugins.
     *
     * Cache : avatarCache[id] = { name, avatar, color, timestamp }
     *
     * @param {{ name: string, id: number|string }} user - Infos minimales
     * @param {boolean} [forceUpdate=false] - Ignore le cache et refetch
     * @returns {Promise<{ avatar: string, color: string }>} Objet anonyme { avatar, color }
     */
    getUser: async function ({ name, id }, forceUpdate = false) {
      const empty = { avatar: "", color: "" };

      const safeId = String(id ?? "").trim();
      const safeName = String(name ?? "").trim();
      if (!safeId || safeName === "Anonymous") return empty;

      const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
      const users = utils.storage("avatarCache", { ttl: CACHE_TTL });

      /** @param {any} entry */
      const isValidEntry = (entry) =>
        entry && typeof entry === "object" && typeof entry.timestamp === "number" && "name" in entry && "avatar" in entry && "color" in entry;

      // 1) Cache (si autorisÃ©)
      const cached = users.get(safeId);
      if (!forceUpdate && isValidEntry(cached)) {
        return { avatar: cached.avatar || "", color: cached.color || "" };
      }

      // 2) Utilisateur connectÃ© : pas de fetch, on Ã©crit quand mÃªme en cache pour les autres plugins
      const myId = String(utils.getUserId?.() ?? "");
      if (safeId === myId) {
        const avatar = String(utils.getAvatar?.() ?? "") || "";
        const rawColor = String(utils.getGroupColor?.() ?? "") || "";
        const normalizedColor = rawColor ? (rawColor.startsWith("#") ? rawColor : `#${rawColor}`) : "";

        users.set(safeId, {
          name: safeName,
          avatar,
          color: normalizedColor,
        });

        return { avatar, color: normalizedColor };
      }

      // 3) Fetch profil
      try {
        const res = await fetch(`/u${encodeURIComponent(safeId)}`, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const html = await res.text();
        const doc = utils.parseHTML(html);

        // Avatar : on garde un sÃ©lecteur "best effort" sans Ãªtre trop agressif.
        // (si tu as un sÃ©lecteur exact dans ton Blank Theme, remplace par celui-ci)
        const avatarEl = utils.get(`img[alt="${CSS.escape(safeName)}"]`, doc, { required: false });
        const avatar = avatarEl?.getAttribute("src") ? String(avatarEl.getAttribute("src")) : "";

        // Couleur : Forumactif met toujours style="color:#5562D4" quand il y en a une.
        // On extrait #hex directement du style attribute (simple et robuste).
        let color = "";
        const nameEl = utils.get(`span[style^="color:#"]:has(strong)`, doc, { required: false });
        const style = nameEl?.getAttribute("style") || "";
        const match = style.match(/color\s*:\s*(#[0-9a-fA-F]{3,6})/);
        if (match) color = match[1];

        users.set(safeId, {
          name: safeName,
          avatar,
          color,
        });

        return { avatar, color };
      } catch (err) {
        // Fallback : si une vieille entrÃ©e existe encore dans le storage (mÃªme expirÃ©e),
        // on peut essayer de la relire via getAll() (non filtrÃ© TTL).
        const all = users.getAll?.() || {};
        const stale = all[safeId];

        if (isValidEntry(stale)) {
          return { avatar: stale.avatar || "", color: stale.color || "" };
        }

        utils.warn(`getUser: impossible de rÃ©cupÃ©rer le profil de ${safeName} (#${safeId})`, err);
        return empty;
      }
    },
  };

  const plugin = factory(utils);

  if (!plugin || typeof plugin !== "object") {
    utils.warn("Factory: le plugin retournÃ© n'est pas un objet.");
    return {};
  }

  return plugin;
}
