const menuButton = document.querySelector(".menu-button");
const menuPanel = document.querySelector(".menu-panel");
const VALID_COLUMN_CANDIDATES = ["isValid", "is_valid"];

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

const medicineForm = document.querySelector("[data-medicine-form]");
const medicineList = document.querySelector("[data-medicine-list]");
const statusMessage = document.querySelector("[data-status-message]");
const homeMedicineList = document.querySelector("[data-home-medicine-list]");
const homeStatusMessage = document.querySelector("[data-home-status-message]");

const supabaseUrl = window.MEDICATION_LOG_SUPABASE_URL;
const supabaseAnonKey = window.MEDICATION_LOG_SUPABASE_ANON_KEY;
const googleClientId = window.MEDICATION_LOG_GOOGLE_CLIENT_ID;
const googleAccountEmail = window.MEDICATION_LOG_GOOGLE_ACCOUNT_EMAIL;
const googleCalendarId = window.MEDICATION_LOG_GOOGLE_CALENDAR_ID;
const createClient = window.supabase?.createClient;
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

let googleAccessToken = "";
let googleTokenClient = null;

const getValidColumnName = (medicine = {}) =>
  VALID_COLUMN_CANDIDATES.find((columnName) =>
    Object.prototype.hasOwnProperty.call(medicine, columnName)
  ) ?? "isValid";

const getValidValue = (medicine = {}) => Boolean(medicine[getValidColumnName(medicine)]);

const createSupabaseClient = () => {
  if (typeof createClient !== "function" || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

const formatConfirmationDateTime = (value = new Date()) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

const hasGoogleCalendarConfig = () =>
  Boolean(googleClientId && googleAccountEmail && googleCalendarId);

const createMedicationLogRecord = async (
  supabaseClient,
  medicationId,
  googleCalendarEventId,
  recordedAt
) => {
  const { error } = await supabaseClient
    .from("medication_log")
    .insert([{
      medicine_id: medicationId,
      google_calendar_event_id: googleCalendarEventId,
      created_at: recordedAt,
    }]);

  return { error };
};

const getGoogleTokenClient = () => {
  if (googleTokenClient || !window.google?.accounts?.oauth2 || !googleClientId) {
    return googleTokenClient;
  }

  googleTokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: googleClientId,
    scope: GOOGLE_CALENDAR_SCOPE,
    callback: () => {},
  });

  return googleTokenClient;
};

const requestGoogleAccessToken = () =>
  new Promise((resolve, reject) => {
    if (!hasGoogleCalendarConfig()) {
      reject(new Error("config.js に Google カレンダー連携設定を追加してください。"));
      return;
    }

    const tokenClient = getGoogleTokenClient();

    if (!tokenClient) {
      reject(new Error("Google 認証ライブラリの読み込みに失敗しました。"));
      return;
    }

    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      googleAccessToken = response.access_token ?? "";
      resolve(googleAccessToken);
    };

    tokenClient.requestAccessToken({
      prompt: googleAccessToken ? "" : "consent",
      login_hint: googleAccountEmail,
    });
  });

const formatCalendarDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
};

const createGoogleCalendarEvent = async (medicineName, createdAt) => {
  const accessToken = googleAccessToken || await requestGoogleAccessToken();
  const startAt = new Date(createdAt);

  if (Number.isNaN(startAt.getTime())) {
    throw new Error("medication_log.created_at を日時として解釈できませんでした。");
  }

  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `☑️${medicineName}`,
        start: {
          dateTime: formatCalendarDateTime(startAt),
          timeZone,
        },
        end: {
          dateTime: formatCalendarDateTime(endAt),
          timeZone,
        },
      }),
    }
  );

  if (response.status === 401 && googleAccessToken) {
    googleAccessToken = "";
    return createGoogleCalendarEvent(medicineName, createdAt);
  }

  if (!response.ok) {
    let errorMessage = "Google カレンダーへの登録に失敗しました。";

    try {
      const errorPayload = await response.json();
      errorMessage = errorPayload.error?.message || errorMessage;
    } catch {
      // Ignore JSON parse failure and keep the default message.
    }

    throw new Error(errorMessage);
  }

  return response.json();
};

const deleteGoogleCalendarEvent = async (eventId) => {
  const accessToken = googleAccessToken || await requestGoogleAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status === 401 && googleAccessToken) {
    googleAccessToken = "";
    return deleteGoogleCalendarEvent(eventId);
  }

  if (!response.ok) {
    let errorMessage = "Google カレンダーイベントの削除に失敗しました。";

    try {
      const errorPayload = await response.json();
      errorMessage = errorPayload.error?.message || errorMessage;
    } catch {
      // Ignore JSON parse failure and keep the default message.
    }

    throw new Error(errorMessage);
  }
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
    renderHomeEmptyState("medicineはまだ表示できません。");
    setHomeStatus("config.js に Supabase URL と anon key を設定してください。", "error");
  } else {
    const loadHomeMedicines = async () => {
      setHomeStatus("medicine を読み込み中です。");

      const { data, error } = await supabaseClient
        .from("medicine")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        renderHomeEmptyState("medicineを読み込めませんでした。");
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
          const recordedAt = new Date();
          const confirmationDateTime = formatConfirmationDateTime(recordedAt);
          const shouldRecord = window.confirm(
            `${medicine.name}の服薬を${confirmationDateTime}に記録します。よろしいですか？`
          );

          if (!shouldRecord) {
            return;
          }

          button.disabled = true;
          setHomeStatus("Google カレンダーへ登録中です。");

          let googleCalendarEvent;

          try {
            googleCalendarEvent = await createGoogleCalendarEvent(
              medicine.name,
              recordedAt.toISOString()
            );
          } catch (calendarError) {
            button.disabled = false;
            setHomeStatus(`Google カレンダー登録に失敗しました: ${calendarError.message}`, "error");
            return;
          }

          if (!googleCalendarEvent?.id) {
            button.disabled = false;
            setHomeStatus("Google カレンダーイベント ID を取得できませんでした。", "error");
            return;
          }

          setHomeStatus("服薬記録を保存中です。");

          const { error } = await createMedicationLogRecord(
            supabaseClient,
            medicine.id,
            googleCalendarEvent.id,
            recordedAt.toISOString()
          );

          if (error) {
            try {
              await deleteGoogleCalendarEvent(googleCalendarEvent.id);
            } catch (deleteError) {
              button.disabled = false;
              setHomeStatus(
                `服薬記録の保存に失敗し、Google カレンダーイベント削除にも失敗しました: ${deleteError.message}`,
                "error"
              );
              return;
            }

            button.disabled = false;
            setHomeStatus(
              `服薬記録の保存に失敗したため、Google カレンダーイベントを取り消しました: ${error.message}`,
              "error"
            );
            return;
          }

          button.disabled = false;
          setHomeStatus(`${medicine.name}の服薬を記録しました。`, "success");
        });
        homeMedicineList.append(button);
      });
      setHomeStatus("");
    };

    loadHomeMedicines();
  }
}

if (medicineForm && medicineList && statusMessage) {
  const nameInput = medicineForm.elements.namedItem("name");

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

  if (
    !(nameInput instanceof HTMLInputElement) ||
    !createSupabaseClient()
  ) {
    setFormDisabled(true);
    renderEmptyState("medicineはまだ表示できません。");
    setStatus("config.js に Supabase URL と anon key を設定してください。", "error");
  } else {
    const supabaseClient = createSupabaseClient();

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
        renderEmptyState("medicineはまだ登録されていません。");
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
        renderEmptyState("medicineを読み込めませんでした。");
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

      setStatus("");
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
