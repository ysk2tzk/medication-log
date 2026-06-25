const menuButton = document.querySelector(".menu-button");
const menuPanel = document.querySelector(".menu-panel");
const medicineForm = document.querySelector("[data-medicine-form]");
const medicineList = document.querySelector("[data-medicine-list]");
const statusMessage = document.querySelector("[data-status-message]");
const homeMedicineList = document.querySelector("[data-home-medicine-list]");
const homeStatusMessage = document.querySelector("[data-home-status-message]");

const VALID_COLUMN_CANDIDATES = ["isValid", "is_valid"];
const supabaseUrl = window.MEDICATION_LOG_SUPABASE_URL;
const supabaseAnonKey = window.MEDICATION_LOG_SUPABASE_ANON_KEY;
const googleCalendarFunctionName =
  window.MEDICATION_LOG_GOOGLE_FUNCTION_NAME || "google-calendar-log";
const createClient = window.supabase?.createClient;

if (menuButton && menuPanel) {
  const closeMenu = () => {
    menuButton.setAttribute("aria-expanded", "false");
    menuPanel.classList.remove("is-open");
  };

  const toggleMenu = () => {
    const isExpanded = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isExpanded));
    menuPanel.classList.toggle("is-open", !isExpanded);
  };

  closeMenu();

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu-wrap")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

const createSupabaseClient = () => {
  if (typeof createClient !== "function" || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

const getValidColumnName = (medicine = {}) =>
  VALID_COLUMN_CANDIDATES.find((columnName) =>
    Object.prototype.hasOwnProperty.call(medicine, columnName)
  ) ?? "isValid";

const getValidValue = (medicine = {}) =>
  Boolean(medicine[getValidColumnName(medicine)]);

const formatConfirmationDateTime = (value = new Date()) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

const floorDateToHalfHour = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date(NaN);
  }

  date.setSeconds(0, 0);
  date.setMinutes(Math.floor(date.getMinutes() / 30) * 30);
  return date;
};

const createMedicationLogRecord = async (supabaseClient, medicationId, recordedAt) => {
  const { data, error } = await supabaseClient.functions.invoke(
    googleCalendarFunctionName,
    {
      body: {
        medicineId: medicationId,
        recordedAt,
      },
    }
  );

  if (error) {
    throw new Error(error.message || "服薬記録の保存に失敗しました。");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};

if (homeMedicineList && homeStatusMessage) {
  const supabaseClient = createSupabaseClient();

  const setHomeStatus = (message, type = "") => {
    homeStatusMessage.textContent = message;
    homeStatusMessage.className = "status-message";

    if (type) {
      homeStatusMessage.classList.add(`is-${type}`);
    }
  };

  const renderHomeEmptyState = (message) => {
    homeMedicineList.innerHTML = `<p class="empty-message">${message}</p>`;
  };

  if (!supabaseClient) {
    renderHomeEmptyState("medicine はまだ表示できません。");
    setHomeStatus("config.js に Supabase URL と anon key を設定してください。", "error");
  } else {
    const loadHomeMedicines = async () => {
      setHomeStatus("medicine を読み込み中です。");

      const { data, error } = await supabaseClient
        .from("medicine")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        renderHomeEmptyState("medicine を読み込めませんでした。");
        setHomeStatus(`一覧取得に失敗しました: ${error.message}`, "error");
        return;
      }

      const validMedicines = (data ?? []).filter((medicine) => getValidValue(medicine));

      if (!validMedicines.length) {
        renderHomeEmptyState("isValid=true の medicine はありません。");
        setHomeStatus("表示対象の medicine が0件です。", "error");
        return;
      }

      homeMedicineList.innerHTML = "";

      validMedicines.forEach((medicine) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "medicine-action-button";
        button.textContent = medicine.name;
        button.addEventListener("click", async () => {
          const recordedAt = floorDateToHalfHour(new Date());
          const confirmationDateTime = formatConfirmationDateTime(recordedAt);
          const shouldRecord = window.confirm(
            `${medicine.name}の服薬を${confirmationDateTime}に記録します。よろしいですか？`
          );

          if (!shouldRecord) {
            return;
          }

          button.disabled = true;
          setHomeStatus("Google カレンダーと服薬記録を保存中です。");

          try {
            await createMedicationLogRecord(
              supabaseClient,
              medicine.id,
              recordedAt.toISOString()
            );
          } catch (error) {
            button.disabled = false;
            setHomeStatus("", "");
            window.alert(`登録に失敗しました: ${error.message}`);
            return;
          }

          button.disabled = false;
          setHomeStatus("", "");
          window.alert(`${medicine.name}の服薬を記録し、Google カレンダーにも登録しました。`);
        });

        homeMedicineList.append(button);
      });

      setHomeStatus("", "");
    };

    loadHomeMedicines();
  }
}

if (medicineForm && medicineList && statusMessage) {
  const nameInput = medicineForm.elements.namedItem("name");
  const supabaseClient = createSupabaseClient();

  const setStatus = (message, type = "") => {
    statusMessage.textContent = message;
    statusMessage.className = "status-message";

    if (type) {
      statusMessage.classList.add(`is-${type}`);
    }
  };

  const setFormDisabled = (disabled) => {
    medicineForm.querySelectorAll("input, button").forEach((element) => {
      element.disabled = disabled;
    });
  };

  const renderEmptyState = (message) => {
    medicineList.innerHTML = `<p class="empty-message">${message}</p>`;
  };

  if (!(nameInput instanceof HTMLInputElement) || !supabaseClient) {
    setFormDisabled(true);
    renderEmptyState("medicine はまだ表示できません。");
    setStatus("config.js に Supabase URL と anon key を設定してください。", "error");
  } else {
    const insertMedicine = async (name) => {
      const insertPayloads = [
        { name, isValid: true },
        { name, is_valid: true },
      ];

      for (const payload of insertPayloads) {
        const result = await supabaseClient
          .from("medicine")
          .insert([payload])
          .select();

        if (!result.error) {
          return result;
        }

        const message = result.error.message ?? "";
        const isMissingColumnError =
          message.includes("Could not find the") ||
          message.includes("column") ||
          message.includes("schema cache");

        if (!isMissingColumnError) {
          return result;
        }
      }

      return {
        data: null,
        error: new Error("medicine の登録に使用できる有効フラグ列が見つかりませんでした。"),
      };
    };

    const renderMedicines = (medicines) => {
      if (!medicines.length) {
        renderEmptyState("medicine はまだ登録されていません。");
        return;
      }

      medicineList.innerHTML = "";

      medicines.forEach((medicine) => {
        const item = document.createElement("article");
        item.className = "medicine-item";

        const name = document.createElement("p");
        name.className = "medicine-name";
        name.textContent = medicine.name;

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "switch";

        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = getValidValue(medicine);
        toggle.setAttribute("aria-label", `${medicine.name} の有効状態`);

        const slider = document.createElement("span");
        slider.className = "switch-slider";

        toggle.addEventListener("change", async () => {
          const nextValue = toggle.checked;
          const validColumnName = getValidColumnName(medicine);
          toggle.disabled = true;

          const { error } = await supabaseClient
            .from("medicine")
            .update({ [validColumnName]: nextValue })
            .eq("id", medicine.id);

          toggle.disabled = false;

          if (error) {
            toggle.checked = !nextValue;
            setStatus(`更新に失敗しました: ${error.message}`, "error");
            return;
          }

          setStatus(
            `${medicine.name}を${nextValue ? "有効" : "無効"}にしました。`,
            "success"
          );
        });

        toggleLabel.append(toggle, slider);
        item.append(name, toggleLabel);
        medicineList.append(item);
      });
    };

    const loadMedicines = async () => {
      setStatus("medicine を読み込み中です。");

      const { data, error } = await supabaseClient
        .from("medicine")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        renderEmptyState("medicine を読み込めませんでした。");
        setStatus(`一覧取得に失敗しました: ${error.message}`, "error");
        return;
      }

      renderMedicines(data ?? []);

      if ((data ?? []).length === 0) {
        setStatus(
          "一覧が0件です。insert が成功している場合は Supabase の SELECT policy / RLS を確認してください。",
          "error"
        );
        return;
      }

      setStatus("", "");
    };

    medicineForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = nameInput.value.trim();

      if (!name) {
        setStatus("Name を入力してください。", "error");
        nameInput.focus();
        return;
      }

      const shouldInsert = window.confirm(`${name}を登録します。よろしいですか？`);

      if (!shouldInsert) {
        setStatus("登録をキャンセルしました。");
        return;
      }

      setFormDisabled(true);
      setStatus("medicine を追加中です。");

      const { data, error } = await insertMedicine(name);

      setFormDisabled(false);

      if (error) {
        setStatus(`追加に失敗しました: ${error.message}`, "error");
        return;
      }

      medicineForm.reset();
      nameInput.focus();

      if ((data ?? []).length === 0) {
        setStatus(
          "追加は成功しましたが、返却データがありません。RLS の設定を確認してください。",
          "error"
        );
      } else {
        setStatus("medicine を追加しました。", "success");
      }

      await loadMedicines();
    });

    loadMedicines();
  }
}
