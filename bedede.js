(function (root, factory) {
  var pluginName = "BÃ©dÃ©dÃ©";

  if (typeof define === "function" && define.amd) {
    define([], factory(pluginName));
  } else if (typeof exports === "object") {
    module.exports = factory(pluginName);
  } else {
    root[pluginName] = factory(pluginName);
  }
})(this, function (pluginName) {
  ("use strict");

  var defaults = {
    mode: "pro",
    source: "1",
  };
  /**
   * Merge defaults with user options
   * @param {Object} defaults Default settings
   * @param {Object} options User options
   */
  var extend = function (target, options) {
    var prop,
      extended = {};
    for (prop in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, prop)) {
        extended[prop] = defaults[prop];
      }
    }
    for (prop in options) {
      if (Object.prototype.hasOwnProperty.call(options, prop)) {
        extended[prop] = options[prop];
      }
    }
    return extended;
  };

  /**
   * Slugify some text
   * @param {String} str Text to be slugify
   * @param {String} separator Character to replace spaces
   * @private
   */
  const slugify = (str, separator = "_") => {
    return str
      .toString()
      .normalize("NFD") // split an accented letter in the base letter and the acent
      .replace(/[\u0300-\u036f]/g, "") // remove all previously split accents
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 ]/g, "") // remove all chars not letters, numbers and spaces (to be replaced)
      .replace(/\s+/g, separator);
  };

  const MAX_LENGTH = 127999;
  const TABLE_ID = "bdd";
  const ADMIN_KEYS = (function () {
    const admin_link = document.querySelector('a[href^="/admin/"]');
    if (!admin_link) return false;

    const url = new URLSearchParams(admin_link.href);
    return {
      tid: url.get("tid"),
      t: url.get("tc"),
    };
  })();
  const CURRENT_PAGE_ID = window.location.pathname.replace(/\D/g, "");
  const COL_TYPES = ["string", "select", "text"];
  let has_content_changed = new Object({ value: false });
  let has_content_changed_proxy = new Proxy(has_content_changed, {
    set: function (target, property, value) {
      target[property] = value;
      return true;
    },
  });

  let selected_rows = new Proxy(new Array(), {
    deleteProperty: function (target, property) {
      delete target[property];
      updateSelectedRows(target);
      return true;
    },
    set: function (target, property, value) {
      target[property] = value;
      if (property !== "length") {
        updateSelectedRows(target);
      }
      return true;
    },
  });

  function updateSelectedRows(target) {
    const table = document.querySelector("#bdd");
    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      if (target.includes(row.id)) {
        row.classList.add("isSelected");
      } else {
        row.classList.remove("isSelected");
      }
    });
    if (target.length >= 1) {
      table.querySelector('input[name="delete"]').disabled = false;
    } else {
      table.querySelector('input[name="delete"]').disabled = true;
    }
  }

  /**
   * Fetch data from HTML page
   * @param {string} src HTML page ID
   * @private
   */
  var fetchData = async (src) => {
    const response = await fetch(`/h${src}-bdd`);
    return await response.text();
  };

  /**
   * Parses the given HTML string and returns a Document object representing the parsed HTML.
   * @param {string} data - The HTML string to be parsed.
   * @returns {Document} - The Document object representing the parsed HTML.
   * @private
   */
  var htmlParser = (data) => {
    const parser = new DOMParser();
    return parser.parseFromString(data, "text/html");
  };

  /**
   * Generates a version 4 UUID (Universally Unique Identifier).
   * @returns {string} The generated UUID.
   * @private
   */
  function uuidv4() {
    return "10000000".replace(/[018]/g, (c) =>
      (
        +c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
      ).toString(16),
    );
  }

  /**
   * Format fetched data
   * @param {string} data HTML loaded from fetch
   * @private
   */
  const formatDB = async (data) => {
    const doc = htmlParser(data);

    const table = doc.getElementById(TABLE_ID);
    const ths = table.querySelectorAll("thead th");
    const cols = [...ths].map((col) => slugify(col.textContent));
    const rows = [...table.querySelectorAll("tbody tr")].map(
      (rowEl, tr_idx, trs) => {
        const row = {};
        rowEl.querySelectorAll("td").forEach((el, idx) => {
          row["id"] = rowEl.id;
          row[cols[idx]] = el.innerHTML;
        });
        return row;
      },
    );
    return { rows, cols, ths };
  };

  /**
   * init the developper view
   * @private
   */
  function initDevView(id) {
    const table = document.getElementById("bdd");
    const ths = table.querySelectorAll("thead th");
    warnForMissingCols(table, ths);
    createForm({ table, ths, source: id });
    createTable({ table, ths });
  }

  /**
   * Attach to the table the option to delete line data
   * @param {Object} options
   * @param {HTMLElement} options.table - The table element to attach the handler
   */
  function attachHandlers({ table, form }) {
    const trs = table.querySelectorAll("tbody tr");
    const tds = table.querySelectorAll("tbody td");
    trs.forEach((tr) => {
      tr.addEventListener("contextmenu", addSelectedRow);
    });
    tds.forEach((td) => {
      td.addEventListener("input", contentHasChanged);
    });

    form.addEventListener("submit", onTableFormSubmit);
  }

  async function onTableFormSubmit(e) {
    e.preventDefault();
    const resData = await fetchHTMLPage(CURRENT_PAGE_ID);
    const doc = htmlParser(resData.body.html);
    const table = doc.getElementById("bdd");

    switch (e.submitter.name) {
      case "save":
        const tbody = document.querySelector("#bdd tbody");
        tbody.querySelectorAll("td").forEach((el) => {
          el.removeAttribute("contenteditable");
        });
        table
          .querySelector("tbody")
          .replaceWith(document.querySelector("#bdd tbody"));
        resData.body.html = doc.body.innerHTML;
        break;
      case "delete":
        for (const [idx, id] of Object.entries(selected_rows)) {
          table.querySelector("#" + id).remove();
        }
        resData.body.html = doc.body.innerHTML;
        break;
    }

    postToHTML(resData);

    /*   */
  }

  function addSelectedRow(e) {
    e.preventDefault();
    const tr_id = e.currentTarget.id;
    if (!tr_id) return;
    addOrRemoveToArray(selected_rows, tr_id);
  }

  function addOrRemoveToArray(array, value) {
    var index = array.indexOf(value);
    if (index === -1) {
      array.push(value);
    } else {
      array.splice(index, 1);
    }
  }

  function contentHasChanged(e) {
    const table = document.querySelector("#bdd");
    const input = table.querySelector('input[name="save"]');
    input.disabled = false;
  }

  /**
   *
   */
  function createTable({ table, ths }) {
    const caption = document.createElement("caption");
    const form = document.createElement("form");

    const delete_button = document.createElement("input");
    delete_button.value = "Supprimer";
    delete_button.type = "submit";
    delete_button.name = "delete";
    delete_button.disabled = true;

    const save_button = document.createElement("input");
    save_button.value = "Sauvegarder";
    save_button.type = "submit";
    save_button.name = "save";
    save_button.disabled = true;

    form.append(delete_button, save_button);
    caption.append(form);
    table.prepend(caption);

    // make table editable
    table.querySelectorAll("td").forEach((td) => {
      td.contentEditable = "true";
      td.addEventListener("paste", function (e) {
        e.preventDefault();
        const plainText = (e.clipboardData || window.clipboardData).getData(
          "text/plain",
        );
        document.execCommand("insertText", false, plainText);
      });
    });
    attachHandlers({ table, form });
  }

  /**
   * Creates a form based on the given table and column headers.
   * @param {HTMLElement} table - The table element.
   * @param {NodeList} ths - The list of table header elements.
   * @param {string} source - The data source for the form.
   * @returns {void}
   * @private
   */
  function createForm({ table, ths, source }) {
    const cols = [...ths].map((col) => slugify(col.textContent));
    const frag = document.createDocumentFragment();

    const form = document.createElement("form");
    form.id = "bdd-form";
    form.method = "post";

    ths.forEach((th) => {
      var div = document.createElement("div");
      div.className = "bdd-form-row";
      var col_label = document.createElement("label");
      col_label.className = "bdd-form-label";
      var col_text = slugify(th.textContent);
      var col_type = COL_TYPES.includes(th.getAttribute("type"))
        ? th.getAttribute("type")
        : "string";

      col_label.setAttribute("for", col_text);
      col_label.textContent = col_text;

      // Create the name input field
      switch (col_type) {
        case "select":
          var col_input = document.createElement("select");
          col_input.className = "bdd-form-select";
          var thOptions = th.getAttribute("options").split(",") || ["n/a"];
          thOptions.forEach((option) => {
            var colOption = document.createElement("option");
            colOption.value = option;
            colOption.innerText = option;
            col_input.append(colOption);
          });
          break;
        case "text":
          var col_input = document.createElement("textarea");
          col_input.className = "bdd-form-textarea";
          col_input.style.border = "1px solid #fff";
          break;
        case "string":
          var col_input = document.createElement("input");
          col_input.className = "bdd-form-input";
          col_input.type = "text";

          col_input.style.border = "1px solid #fff";
          break;
      }

      col_input.id = col_text;
      col_input.name = col_text;

      div.append(col_label, col_input);
      form.append(div);
    });

    var submit_button = document.createElement("input");
    submit_button.type = "submit";
    submit_button.value = "Ajouter";

    form.append(submit_button);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      createNewEntry(e, source, cols);
    });

    addLengthCounter({ form, table, submit_button });

    frag.append(form);
    table.parentNode.insertBefore(frag, table);
  }

  /**
   * Adds a character counter to form.
   * @param {HTMLFormElement} form The for to add the counter to
   * @returns {void}
   * @private
   */
  function addLengthCounter({ form, table, submit_button }) {
    const table_length = table.innerHTML.length;
    const th_length = table.querySelectorAll("th").length;
    const base_length = uuidv4().length + 43 + "<td></td>".length * th_length;

    let el = document.createElement("p");
    el.innerText = `Il vous reste ${checkLengthLimit(
      table_length + base_length,
    )} charactÃ¨res.`;
    form.appendChild(el);

    const allInputs = form.querySelectorAll(
      'input:not([type="submit"]), textarea, select',
    );
    allInputs.forEach((i) => {
      i.addEventListener("input", (e) => {
        let inputs_value_length = 0;
        allInputs.forEach((input) => {
          inputs_value_length += input.value.length;
          const character_length = base_length + inputs_value_length;
          if (checkLengthLimit(character_length) <= 0) {
            submit_button.disabled = true;
          } else {
            submit_button.disabled = false;
          }
          el.innerText = `Il vous reste ${checkLengthLimit(
            character_length,
          )} charactÃ¨res.`;
        });
      });
    });
  }

  function checkLengthLimit(number) {
    return MAX_LENGTH - number - 200;
  }

  /** FETCHER */
  function Fetcher(url, options, body) {
    return fetch(url, this.fetchOptions(options, body));
  }

  Fetcher.prototype.fetchOptions = function (options, body) {
    /* setup default headers and parse of body for FA */
    const update = { ...options };
    update.headers = {
      ...update.headers,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    update.body = this.bodyData(body);
    return update;
  };

  Fetcher.prototype.toFormData = function (obj) {
    var form_data = new FormData();

    for (var key in obj) {
      form_data.append(key, obj[key]);
    }
    return form_data;
  };

  Fetcher.prototype.encodeFormData = function (data) {
    return [...data.entries()]
      .map((x) => `${encodeURIComponent(x[0])}=${encodeURIComponent(x[1])}`)
      .join("&");
  };

  Fetcher.prototype.bodyData = function (obj) {
    // compatible data for FA with fetch
    return this.encodeFormData(this.toFormData(obj));
  };

  /**
   * Fetches an HTML page.
   * @param {string} source - HTML ID Page of database.
   * @returns {Promise<{ body: object, action: string }>} - The body and action of the fetched HTML page.
   */
  async function fetchHTMLPage(source) {
    const response = await fetch(
      `/admin/?part=modules&sub=html&mode=go_edit&page=${source}&editor=html&extended_admin=1&tid=${ADMIN_KEYS.tid}&_t=${ADMIN_KEYS.tc}`,
    );
    const data = htmlParser(await response.text());
    const resForm = data.getElementById("formenvoi");
    const action = resForm.action;
    let body = {};

    resForm
      .querySelectorAll('input:not([type="submit"], [type="radio"]), textarea')
      .forEach((el) => {
        body[el.name] = el.value;
      });

    body.forumact_template = 1;
    body.set_homepage = 0;
    body.submit = 1;

    return { body, action };
  }
  /**
   * Submits a form asynchronously.
   *
   * @param {Event} e - The event object.
   * @param {number} source - HTML ID Page of database.
   * @param {array} cols - Array of table attributes.
   * @returns {Promise<string>} - A promise that resolves to a string representing the response text.
   * @private
   */
  async function createNewEntry(e, source, cols) {
    var formData = new FormData(e.target);
    var formBody = {};
    cols.forEach((col) => {
      formBody[col] = formData.get(col) || "";
    });

    const resData = await fetchHTMLPage(source);
    const doc = htmlParser(resData.body.html);
    const table = doc.getElementById("bdd");

    const tr = document.createElement("tr");
    tr.id = "r" + uuidv4();

    for (const [key, value] of Object.entries(formBody)) {
      const td = document.createElement("td");
      td.innerHTML = value;
      tr.append(td);
    }
    table.querySelector("tbody").append(tr);
    resData.body.html = doc.body.innerHTML;

    postToHTML(resData);
  }

  function postToHTML(resData) {
    return new Fetcher(
      resData.action,
      {
        method: "POST",
      },
      resData.body,
    )
      .then((r) => r.text())
      .then((res) => {
        console.log(htmlParser(res).querySelector("#main-content .errorbox"));
        location.reload();
      });
  }

  /**
   * Highlight a line when there's a missing col
   * @param {object} table
   * @param {array} cols
   */
  function warnForMissingCols(table, cols) {
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      if (tds.length !== cols.length) {
        tr.style.border = "2px dotted yellow";
      }
    });
  }

  /**
   * Highlight a row that has nos enough tds in table
   * @param {array} source
   * @param {string} key
   * @param {string|number} value
   * @private
   */
  function findByKey(source, key, value) {
    for (var i = 0; i < source.length; i++) {
      if (source[i][key] === value) {
        return source[i];
      }
    }
    throw "Couldn't find object with key: " + key + " and value: " + value;
  }

  /**
   * @private
   * @returns {object()}
   */
  const queryItUp = {
    "==": function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key] === value) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
    "!=": function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key] != value) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
    ">": function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key] > Number(value)) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
    "<": function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key] < Number(value)) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
    ">=": function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key] >= Number(value)) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
    "<=": function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key] <= Number(value)) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
    contains: function (source, key, value) {
      let temp_data = [];
      for (var i = 0; i < source.length; i++) {
        if (source[i][key].indexOf(value) >= 0) {
          temp_data.push(source[i]);
        }
      }
      return temp_data;
    },
  };

  /**
   * Plugin Object
   * @param {object} options User options
   * @constructor
   */
  function Plugin(id, options) {
    if (!id) return;
    this.id = id;
    this.options = extend(defaults, options);
    this.init();
  }

  /**
   * Plugin prototype
   * @public
   * @constructor
   */
  Plugin.prototype = {
    init: function () {
      this.data = fetchData(this.id).then(formatDB);
      this.onPageLoaded();
    }, // #! init
    onPageLoaded: function () {
      const pathname = window.location.pathname;
      if (pathname.indexOf(`/h${this.id}`) === 0) {
        if (!ADMIN_KEYS) window.location.pathname = "/";
        initDevView(this.id);
      }
    }, // #! onPageLoaded
    /**
     * getAll()
     * @returns {Promise<array>}
     */
    getAll: function () {
      return this.data.then((res) => res.rows);
    }, // #! getAll
    /**
     * getSingle()
     * @returns {Promise<object>}
     * @todo Add a way to limits cols returned.
     */
    getSingle: function (key, comp, value, ...cols) {
      if (arguments.length === 0) {
        return console.warn("Aucune clef de recherche pour la requÃªte");
      }
      return this.data.then((res) => {
        let temp_data = {};
        if (!arguments.length === 1 && typeof key === "number") {
          temp_data = findByKey(res.rows, "id", key);
        }
        if (arguments.length >= 3) {
          temp_data = {
            ...(queryItUp[comp](res.rows, key, value)[0] || {}),
          };
        }

        return temp_data;
      });
    }, // #! getSingle
    /**
     * getCollection()
     * @returns {Promise<array>}
     * @todo Add a way to limits cols returned.
     */
    getCollection: function (key, comp, value, ...cols) {
      if (arguments.length < 3) {
        return console.warn(
          "Il faut une clef, un operateur et une valeur pour crÃ©er une collection.",
        );
      }
      if (arguments.length >= 3) {
        return this.data.then((res) => queryItUp[comp](res.rows, key, value));
      }
    },
  };
  return Plugin;
});
