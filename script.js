const STORAGE_KEY = "pnc_wiki_generator_autosave";

const fields = {
  name: document.getElementById("dollName"),
  job: document.getElementById("dollJob"),
  model: document.getElementById("dollModel"),
  company: document.querySelectorAll('input[name="dollCompany"]'),
  classType: document.querySelectorAll('input[name="dollClass"]'),
  birthdayMonth: document.getElementById("dollBirthdayMonth"),
  birthdayDay: document.getElementById("dollBirthdayDay"),
  birthdayUnknown: document.getElementById("dollBirthdayUnknown"),
  history: document.getElementById("dollHistory"),
  quote: document.getElementById("dollQuote"),
};

const preview = {
  name: document.getElementById("previewName"),
  topName: document.getElementById("topPreviewName"),
  job: document.getElementById("previewJob"),
  model: document.getElementById("previewModel"),
  company: document.getElementById("previewCompany"),
  classType: document.getElementById("previewClass"),
  birthday: document.getElementById("previewBirthday"),
  history: document.getElementById("previewHistory"),
  quote: document.getElementById("previewQuote"),
};

const resetButton = document.getElementById("resetButton");
const saveJsonButton = document.getElementById("saveJsonButton");
const loadJsonInput = document.getElementById("loadJsonInput");

const wikiToc = document.getElementById("wikiToc");
const tocToggleButton = document.getElementById("tocToggleButton");
const tocArrow = tocToggleButton
  ? tocToggleButton.querySelector(".toc-arrow")
  : null;
const tocList = document.getElementById("tocList");
const sectionToggles = document.querySelectorAll("[data-section]");

const sectionMap = [
  { key: "overview", title: "개요", id: "overview", fixed: true },
  { key: "profile", title: "프로필", id: "profile", fixed: true },
  { key: "performance", title: "성능", id: "performance", fixed: true },
  { key: "algorithm", title: "추천 알고리즘", id: "algorithm", fixed: true },
  { key: "intimacy", title: "친밀도", id: "intimacy", fixed: true },
  { key: "story", title: "스토리", id: "story" },
  { key: "appearance", title: "작중 행적", id: "appearance" },
  { key: "skin", title: "스킨", id: "skin", fixed: true },
  { key: "relationship", title: "인형 관계", id: "relationship", fixed: true },
  { key: "voice", title: "대사", id: "voice", fixed: true },
  { key: "etc", title: "기타", id: "etc", fixed: true },
  { key: "navigation", title: "둘러보기", id: "navigation", fixed: true },
];

function valueOrDash(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : "-";
}

function getCheckedValue(radioList) {
  const checked = [...radioList].find((radio) => radio.checked);
  return checked ? checked.value : "";
}

function setCheckedValue(radioList, value) {
  radioList.forEach((radio) => {
    radio.checked = radio.value === value;
  });
}

function getBirthdayText() {
  if (fields.birthdayUnknown.checked) {
    return "불명";
  }

  const month = fields.birthdayMonth.value;
  const day = fields.birthdayDay.value;

  if (!month && !day) {
    return "";
  }

  if (month && day) {
    return `${month} ${day}`;
  }

  return month || day;
}

function syncBirthdayDisabledState() {
  const isUnknown = fields.birthdayUnknown.checked;

  fields.birthdayMonth.disabled = isUnknown;
  fields.birthdayDay.disabled = isUnknown;

  if (isUnknown) {
    fields.birthdayMonth.value = "";
    fields.birthdayDay.value = "";
  }
}

function updateBirthdayDayOptions() {
  const currentDay = fields.birthdayDay.value;
  const month = parseInt(fields.birthdayMonth.value, 10);

  const daysByMonth = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
  };

  const maxDay = daysByMonth[month] || 31;

  fields.birthdayDay.innerHTML = `<option value="">- 일</option>`;

  for (let day = 1; day <= maxDay; day += 1) {
    const option = document.createElement("option");
    option.value = `${day}일`;
    option.textContent = `${day}일`;
    fields.birthdayDay.appendChild(option);
  }

  if (parseInt(currentDay, 10) <= maxDay) {
    fields.birthdayDay.value = currentDay;
  } else {
    fields.birthdayDay.value = "";
  }
}

function getFormData() {
  return {
    name: fields.name.value,
    job: fields.job.value,
    model: fields.model.value,
    company: getCheckedValue(fields.company),
    classType: getCheckedValue(fields.classType),
    birthdayMonth: fields.birthdayMonth.value,
    birthdayDay: fields.birthdayDay.value,
    birthdayUnknown: fields.birthdayUnknown.checked,
    history: fields.history.value,
    quote: fields.quote.value,
  };
}

function setFormData(data) {
  fields.name.value = data.name || "";
  fields.job.value = data.job || "";
  fields.model.value = data.model || "";
  setCheckedValue(fields.company, data.company || "");
  setCheckedValue(fields.classType, data.classType || "");
  fields.birthdayMonth.value = data.birthdayMonth || "";
  fields.birthdayDay.value = data.birthdayDay || "";
  fields.birthdayUnknown.checked = Boolean(data.birthdayUnknown);
  fields.history.value = data.history || "";
  fields.quote.value = data.quote || "";

  syncBirthdayDisabledState();
}

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getFormData()));
}

function loadFromLocalStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) return;

  try {
    setFormData(JSON.parse(saved));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function downloadJson() {
  const data = getFormData();

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "pnc_wiki_project.json";
  a.click();

  URL.revokeObjectURL(url);
}

function loadJsonFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      setFormData(data);

      renderPreview();
      saveToLocalStorage();
    } catch {
      alert("올바른 JSON 파일이 아닙니다.");
    }
  };

  reader.readAsText(file);
}

function renderPreview() {
  const name = valueOrDash(fields.name.value);

  preview.name.textContent = name;
  preview.topName.textContent = name;
  preview.job.textContent = valueOrDash(fields.job.value);
  preview.model.textContent = valueOrDash(fields.model.value);
  preview.company.textContent = valueOrDash(getCheckedValue(fields.company));
  preview.classType.textContent = valueOrDash(getCheckedValue(fields.classType));
  preview.birthday.textContent = valueOrDash(getBirthdayText());
  preview.history.textContent = valueOrDash(fields.history.value);

  const quote = fields.quote.value.trim();
  preview.quote.textContent = quote ? `“${quote}”` : "“”";
}

function getSectionToggle(key) {
  return document.querySelector(`[data-section="${key}"]`);
}

function isSectionEnabled(section) {
  const toggle = getSectionToggle(section.key);
  return section.fixed || !toggle || toggle.checked;
}

function renderTocAndSectionNumbers() {
  if (!tocList) return;

  tocList.innerHTML = "";

  let sectionNumber = 1;

  sectionMap.forEach((section) => {
    const sectionElement = document.getElementById(section.id);

    if (!isSectionEnabled(section)) {
      if (sectionElement) {
        sectionElement.hidden = true;
      }
      return;
    }

    if (sectionElement) {
      sectionElement.hidden = false;

      const numberElement =
        sectionElement.querySelector(".section-number");

      if (numberElement) {
        numberElement.textContent = `${sectionNumber}.`;
      }
    }

    const li = document.createElement("li");
    const a = document.createElement("a");

    a.href = `#${section.id}`;
    a.textContent =
  `${sectionNumber}. ${section.title}`;

    li.appendChild(a);
    tocList.appendChild(li);

    sectionNumber += 1;
  });
}

[
  fields.name,
  fields.job,
  fields.model,
  fields.history,
  fields.quote,
].forEach((field) => {
  field.addEventListener("input", () => {
    renderPreview();
    saveToLocalStorage();
  });
});

fields.birthdayMonth.addEventListener("change", () => {
  updateBirthdayDayOptions();
  renderPreview();
  saveToLocalStorage();
});

fields.birthdayDay.addEventListener("change", () => {
  renderPreview();
  saveToLocalStorage();
});

fields.birthdayUnknown.addEventListener("change", () => {
  syncBirthdayDisabledState();
  renderPreview();
  saveToLocalStorage();
});

fields.company.forEach((radio) => {
  radio.addEventListener("change", () => {
    renderPreview();
    saveToLocalStorage();
  });
});

fields.classType.forEach((radio) => {
  radio.addEventListener("change", () => {
    renderPreview();
    saveToLocalStorage();
  });
});

if (tocToggleButton && wikiToc) {
  tocToggleButton.addEventListener("click", () => {
    const isCollapsed = wikiToc.classList.toggle("is-collapsed");

    tocToggleButton.setAttribute(
      "aria-expanded",
      String(!isCollapsed)
    );

    if (tocArrow) {
      tocArrow.textContent = isCollapsed ? "▷" : "˅▽";
    }
  });
}

sectionToggles.forEach((toggle) => {
  toggle.addEventListener("change", () => {
    renderTocAndSectionNumbers();
    saveToLocalStorage();
  });
});

resetButton.addEventListener("click", () => {
  [
    fields.name,
    fields.job,
    fields.model,
    fields.birthdayMonth,
    fields.birthdayDay,
    fields.history,
    fields.quote,
  ].forEach((field) => {
    field.value = "";
  });

  fields.birthdayUnknown.checked = false;
  syncBirthdayDisabledState();

  fields.company.forEach((radio) => {
    radio.checked = false;
  });

  fields.classType.forEach((radio) => {
    radio.checked = false;
  });

  localStorage.removeItem(STORAGE_KEY);
  renderPreview();
});

saveJsonButton.addEventListener("click", () => {
  downloadJson();
});

loadJsonInput.addEventListener("change", (event) => {
  const file = event.target.files[0];

  loadJsonFile(file);

  event.target.value = "";
});

loadFromLocalStorage();
updateBirthdayDayOptions();
renderPreview();
renderTocAndSectionNumbers();
