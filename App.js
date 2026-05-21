// App.js
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Picker } from "@react-native-picker/picker";

import { db, storage } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const LAST_DIARY_KEY = "lastDiary";
const LEGACY_LAST_DIARY_KEY = "LAST_DIARY";
const COMPANY_CONNECTION_KEY = "siteDiaryCompanyConnection";
const APP_CONFIG_KEY = "siteDiaryAppConfig";

const NONE = "__NONE__";

const DEFAULT_APP_CONFIG = {
  companyName: "SiteDiary",
  projectName: "Koketso Project",
  logoUrl: "",
  areas: [
    { name: "Plant", subAreas: ["Area 1", "Area 2", "Area 3"] },
    { name: "Workshop", subAreas: [] },
    { name: "Site", subAreas: [] },
  ],
  wbs: [
    {
      name: "Electrical",
      subOptions: ["Equipment", "Racking", "Cabling", "Termination"],
    },
    {
      name: "Instrumentation",
      subOptions: [
        "Equipment",
        "Racking",
        "Cabling",
        "Instrumentation",
        "Termination",
      ],
    },
    {
      name: "Scaffolding",
      subOptions: ["Erection", "Dismantling"],
    },
  ],
  materials: [
    { name: "Cable", unit: "m", lowStockAlert: 50 },
    { name: "Unistrut", unit: "lengths", lowStockAlert: 10 },
  ],
  customFields: [],
  shiftStart: "07:00",
  shiftEnd: "17:00",
};

const DEFAULT_UOM_OPTIONS = ["ea", "m", "L", "kg", "m²", "m³"];

const LUNCH_OPTIONS = [
  { label: "0.5 hour", value: "0.5" },
  { label: "1 hour", value: "1" },
];

const DEFAULT_ROLES = [
  "Boilermaker",
  "Semi-Skilled Boilermaker",
  "Rigger",
  "Semi-Skilled Rigger",
  "Electrician",
  "Semi-Skilled Electrician",
  "Pipe Fitter",
  "Semi-Skilled Pipe Fitter",
  "Scaffolder",
  "Semi-Skilled Scaffolder",
  "Assistant",
  "SHE Rep",
];

function getLocalDateISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(raw) {
  const digits = (raw || "").replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeForCalc(t) {
  const formatted = formatTimeInput(t);
  if (formatted.length === 2) return `${formatted}:00`;
  if (formatted.length === 4) return `${formatted}0`;
  return formatted;
}

function calcHours(start, finish, lunchHours) {
  const s = normalizeTimeForCalc(start);
  const f = normalizeTimeForCalc(finish);

  if (!s || !f || s.length !== 5 || f.length !== 5) return "";

  const [sh, sm] = s.split(":").map(Number);
  const [fh, fm] = f.split(":").map(Number);

  if ([sh, sm, fh, fm].some((n) => Number.isNaN(n))) return "";

  const startVal = sh + sm / 60;
  const finishVal = fh + fm / 60;
  const diff = finishVal - startVal;

  if (!(diff > 0)) return "";

  const lunch = Number(lunchHours || 0);
  if (Number.isNaN(lunch)) return diff.toFixed(2);

  const adjusted = diff - lunch;
  return adjusted > 0 ? adjusted.toFixed(2) : "";
}

function buildWbsText(main, sub) {
  if (main && main !== NONE && sub && sub !== NONE) return `${main} - ${sub}`;
  if (main && main !== NONE) return main;
  return "";
}

function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "");
}

function sumManpowerHours(rows) {
  return (rows || []).reduce((sum, row) => {
    return sum + Number(row?.hours || 0);
  }, 0);
}

function escapeHtml(s) {
  if (!s && s !== 0) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeAreasFromConfig(config) {
  const rawAreas = Array.isArray(config?.areas) ? config.areas : [];

  if (rawAreas.length > 0 && typeof rawAreas[0] === "object") {
    return rawAreas
      .map((area) => ({
        name: String(area?.name || "").trim(),
        subAreas: Array.isArray(area?.subAreas)
          ? area.subAreas.map((s) => String(s || "").trim()).filter(Boolean)
          : [],
      }))
      .filter((area) => area.name);
  }

  const legacyAreas = rawAreas
    .map((area) => ({
      name: String(area || "").trim(),
      subAreas: [],
    }))
    .filter((area) => area.name);

  if (
    legacyAreas.length > 0 &&
    Array.isArray(config?.subAreas) &&
    config.subAreas.length > 0
  ) {
    legacyAreas[0].subAreas = config.subAreas
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }

  return legacyAreas.length > 0 ? legacyAreas : DEFAULT_APP_CONFIG.areas;
}

function normalizeAppConfig(rawConfig) {
  const merged = {
    ...DEFAULT_APP_CONFIG,
    ...(rawConfig || {}),
  };

  return {
    ...merged,
    areas: normalizeAreasFromConfig(merged),
    wbs: Array.isArray(merged.wbs) ? merged.wbs : DEFAULT_APP_CONFIG.wbs,
    materials: Array.isArray(merged.materials)
      ? merged.materials
      : DEFAULT_APP_CONFIG.materials,
    customFields: Array.isArray(merged.customFields)
      ? merged.customFields
      : [],
  };
}

function getCustomFieldEmptyValue(field) {
  if (field?.type === "dropdown") return NONE;
  if (field?.type === "yesno") return NONE;
  return "";
}

function cleanCustomFieldValue(value) {
  if (value === NONE) return "";
  if (value === undefined || value === null) return "";
  return String(value);
}

const SectionTitle = ({ children }) => (
  <Text style={styles.redSection}>{children}</Text>
);

const TimeInput = ({ value, onChangeText, placeholder }) => {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={(t) => onChangeText(formatTimeInput(t))}
      placeholder={placeholder}
      placeholderTextColor="#666"
      keyboardType="number-pad"
      maxLength={5}
    />
  );
};

export default function App() {
  const todayISO = useMemo(() => getLocalDateISO(), []);

  const [companyNameInput, setCompanyNameInput] = useState("");
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [companyConnection, setCompanyConnection] = useState(null);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [connectingCompany, setConnectingCompany] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  const [date, setDate] = useState(todayISO);
  const [project, setProject] = useState(DEFAULT_APP_CONFIG.projectName);
  const [supervisorName, setSupervisorName] = useState("");

  const [wbsMain, setWbsMain] = useState(NONE);
  const [wbsSub, setWbsSub] = useState(NONE);

  const [selectedArea, setSelectedArea] = useState(NONE);
  const [selectedSubArea, setSelectedSubArea] = useState(NONE);
  const [areaFilter, setAreaFilter] = useState("");
  const [subAreaFilter, setSubAreaFilter] = useState("");

  const [customRoles, setCustomRoles] = useState([]);
  const [newRole, setNewRole] = useState("");

  const [customFieldAnswers, setCustomFieldAnswers] = useState({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [manpower, setManpower] = useState([
    { role: NONE, number: "", start: "", finish: "", lunch: "0.5", hours: "" },
  ]);

  const [tasks, setTasks] = useState([""]);

  const [materials, setMaterials] = useState([
    { description: "", qty: "", uom: NONE, specification: "" },
  ]);

  const [plantEquipment, setPlantEquipment] = useState([
    { description: "", number: "" },
  ]);

  const [issues, setIssues] = useState("");

  useEffect(() => {
    let unsubConfig = null;

    const loadCompanyConnection = async () => {
      try {
        const savedConnection = await AsyncStorage.getItem(
          COMPANY_CONNECTION_KEY
        );

        if (!savedConnection) {
          setConfigLoading(false);
          return;
        }

        const connection = JSON.parse(savedConnection);
        setCompanyConnection(connection);

        const cachedConfig = await AsyncStorage.getItem(APP_CONFIG_KEY);
        if (cachedConfig) {
          const parsed = normalizeAppConfig(JSON.parse(cachedConfig));
          setAppConfig(parsed);

          setProject((prev) => {
            if (!prev || prev === DEFAULT_APP_CONFIG.projectName) {
              return parsed.projectName || DEFAULT_APP_CONFIG.projectName;
            }
            return prev;
          });
        }

        const configRef = doc(
          db,
          "companies",
          connection.companyId,
          "settings",
          "appConfig"
        );

        unsubConfig = onSnapshot(
          configRef,
          async (snap) => {
            if (!snap.exists()) return;

            const freshConfig = normalizeAppConfig(snap.data());

            setAppConfig(freshConfig);

            setProject((prev) => {
              if (!prev || prev === DEFAULT_APP_CONFIG.projectName) {
                return (
                  freshConfig.projectName || DEFAULT_APP_CONFIG.projectName
                );
              }

              return prev;
            });

            await AsyncStorage.setItem(
              APP_CONFIG_KEY,
              JSON.stringify(freshConfig)
            );
          },
          (error) => {
            console.log("Company config listener error:", error);
          }
        );
      } catch (e) {
        console.log("Load company connection error:", e);

        try {
          const cachedConfig = await AsyncStorage.getItem(APP_CONFIG_KEY);
          if (cachedConfig) {
            const parsed = normalizeAppConfig(JSON.parse(cachedConfig));
            setAppConfig(parsed);
          }
        } catch (cacheError) {
          console.log("Cached config error:", cacheError);
        }
      } finally {
        setConfigLoading(false);
      }
    };

    loadCompanyConnection();

    return () => {
      if (unsubConfig) unsubConfig();
    };
  }, []);

  useEffect(() => {
    const loadSavedDiary = async () => {
      try {
        const rawNew = await AsyncStorage.getItem(LAST_DIARY_KEY);
        const rawOld = await AsyncStorage.getItem(LEGACY_LAST_DIARY_KEY);
        const raw = rawNew || rawOld;

        setDate(getLocalDateISO());

        if (!raw) return;

        const saved = JSON.parse(raw);

        setProject(
          saved.project ||
            appConfig.projectName ||
            DEFAULT_APP_CONFIG.projectName
        );
        setSupervisorName(saved.supervisorName || "");

        setWbsMain(saved.wbsMain || NONE);
        setWbsSub(saved.wbsSub || NONE);

        setSelectedArea(saved.selectedArea || NONE);
        setSelectedSubArea(saved.selectedSubArea || NONE);

        setCustomRoles(Array.isArray(saved.customRoles) ? saved.customRoles : []);
        setCustomFieldAnswers(saved.customFieldAnswers || {});

        const loadedManpower = saved.manpower || [
          {
            role: NONE,
            number: "",
            start: "",
            finish: "",
            lunch: "0.5",
            hours: "",
          },
        ];

        setManpower(
          loadedManpower.map((row) => {
            const role = (row.role || "").trim() ? row.role : NONE;
            const number = row.number || "";
            const start = row.start || "";
            const finish = row.finish || "";
            const lunch = (row.lunch || "").trim() ? String(row.lunch) : "0.5";
            const hours = row.hours || calcHours(start, finish, lunch) || "";

            return {
              role,
              number,
              start,
              finish,
              lunch,
              hours,
            };
          })
        );

        setTasks(saved.tasks || [""]);

        const loadedMaterials =
          saved.materials || [
            { description: "", qty: "", uom: NONE, specification: "" },
          ];

        setMaterials(
          loadedMaterials.map((m) => ({
            description: m?.description || "",
            qty: m?.qty || "",
            uom: (m?.uom || "").trim() ? m.uom : NONE,
            specification: m?.specification || "",
          }))
        );

        setPlantEquipment(
          saved.plantEquipment || [{ description: "", number: "" }]
        );
        setIssues(saved.issues || "");
      } catch (e) {
        console.log("Load diary error:", e);
      }
    };

    loadSavedDiary();
  }, []);

  useEffect(() => {
    setCustomFieldAnswers((prev) => {
      const next = { ...(prev || {}) };

      (appConfig.customFields || []).forEach((field) => {
        if (!field?.id) return;

        if (next[field.id] === undefined) {
          next[field.id] = getCustomFieldEmptyValue(field);
        }
      });

      Object.keys(next).forEach((fieldId) => {
        const exists = (appConfig.customFields || []).some(
          (field) => field.id === fieldId
        );

        if (!exists) {
          delete next[fieldId];
        }
      });

      return next;
    });
  }, [appConfig.customFields]);

  useEffect(() => {
    const save = async () => {
      try {
        const diary = {
          project,
          supervisorName,
          wbsMain,
          wbsSub,
          selectedArea,
          selectedSubArea,
          customRoles,
          customFieldAnswers,
          manpower,
          tasks,
          materials,
          plantEquipment,
          issues,
        };

        await AsyncStorage.setItem(LAST_DIARY_KEY, JSON.stringify(diary));
      } catch (e) {
        console.log("Autosave error:", e);
      }
    };

    save();
  }, [
    project,
    supervisorName,
    wbsMain,
    wbsSub,
    selectedArea,
    selectedSubArea,
    customRoles,
    customFieldAnswers,
    manpower,
    tasks,
    materials,
    plantEquipment,
    issues,
  ]);

  const connectToCompany = async () => {
    try {
      if (!companyNameInput.trim()) {
        Alert.alert("Missing company name", "Please enter the company name.");
        return;
      }

      if (!accessCodeInput.trim()) {
        Alert.alert("Missing code", "Please enter the 6-digit access code.");
        return;
      }

      setConnectingCompany(true);

      const codeRef = doc(db, "companyAccessCodes", accessCodeInput.trim());
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        Alert.alert("Invalid code", "This access code does not exist.");
        return;
      }

      const data = codeSnap.data();

      if (!data.active) {
        Alert.alert("Code inactive", "This company access code is not active.");
        return;
      }

      const typedName = companyNameInput.trim().toLowerCase();
      const correctName = String(data.companyName || "").trim().toLowerCase();

      if (typedName !== correctName) {
        Alert.alert(
          "Company name mismatch",
          "The company name does not match this access code."
        );
        return;
      }

      const connection = {
        companyId: data.companyId,
        companyName: data.companyName,
        code: accessCodeInput.trim(),
        connectedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(
        COMPANY_CONNECTION_KEY,
        JSON.stringify(connection)
      );

      setCompanyConnection(connection);

      Alert.alert("Connected", `Connected to ${data.companyName}.`);
    } catch (e) {
      console.log("Connect company error:", e);
      Alert.alert("Connection error", e?.message || "Could not connect.");
    } finally {
      setConnectingCompany(false);
    }
  };

  const disconnectCompany = async () => {
    Alert.alert(
      "Disconnect app",
      "This will remove the company connection from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem(COMPANY_CONNECTION_KEY);
            await AsyncStorage.removeItem(APP_CONFIG_KEY);
            setCompanyConnection(null);
            setAppConfig(DEFAULT_APP_CONFIG);
            setCompanyNameInput("");
            setAccessCodeInput("");
          },
        },
      ]
    );
  };

  const ROLES = useMemo(() => {
    const map = new Map();

    DEFAULT_ROLES.forEach((r) => map.set(r.toLowerCase(), r));

    (customRoles || []).forEach((r) => {
      const cleaned = String(r || "").trim();
      if (!cleaned) return;
      if (!map.has(cleaned.toLowerCase())) {
        map.set(cleaned.toLowerCase(), cleaned);
      }
    });

    return [NONE, ...Array.from(map.values())];
  }, [customRoles]);

  const wbsMainOptions = useMemo(() => {
    const list = Array.isArray(appConfig.wbs) ? appConfig.wbs : [];
    return [NONE, ...list.map((item) => item.name).filter(Boolean)];
  }, [appConfig.wbs]);

  const wbsSubOptions = useMemo(() => {
    if (!wbsMain || wbsMain === NONE) return [NONE];

    const list = Array.isArray(appConfig.wbs) ? appConfig.wbs : [];
    const found = list.find((item) => item.name === wbsMain);

    return [NONE, ...((found && found.subOptions) || [])];
  }, [wbsMain, appConfig.wbs]);

  const areaItems = useMemo(() => {
    return normalizeAreasFromConfig(appConfig);
  }, [appConfig.areas]);

  const filteredAreas = useMemo(() => {
    const q = areaFilter.trim().toLowerCase();

    if (!q) return areaItems;

    return areaItems.filter((area) =>
      String(area.name).toLowerCase().includes(q)
    );
  }, [areaFilter, areaItems]);

  const selectedAreaObject = useMemo(() => {
    if (!selectedArea || selectedArea === NONE) return null;

    return areaItems.find((item) => item.name === selectedArea) || null;
  }, [selectedArea, areaItems]);

  const availableSubAreas = useMemo(() => {
    return selectedAreaObject?.subAreas || [];
  }, [selectedAreaObject]);

  const filteredSubAreas = useMemo(() => {
    const q = subAreaFilter.trim().toLowerCase();

    if (!q) return availableSubAreas;

    return availableSubAreas.filter((item) =>
      String(item).toLowerCase().includes(q)
    );
  }, [availableSubAreas, subAreaFilter]);

  const areaRequiresSubArea = useMemo(() => {
    return selectedArea !== NONE && availableSubAreas.length > 0;
  }, [selectedArea, availableSubAreas]);

  const materialOptions = useMemo(() => {
    const fromConfig = Array.isArray(appConfig.materials)
      ? appConfig.materials.map((m) => m.name).filter(Boolean)
      : [];

    return [NONE, ...fromConfig];
  }, [appConfig.materials]);

  const uomOptions = useMemo(() => {
    const set = new Set(DEFAULT_UOM_OPTIONS);

    if (Array.isArray(appConfig.materials)) {
      appConfig.materials.forEach((m) => {
        if (m?.unit) set.add(m.unit);
      });
    }

    return [NONE, ...Array.from(set)];
  }, [appConfig.materials]);

  const updateManpower = (i, field, value) => {
    setManpower((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [field]: value };

      if (field === "start" || field === "finish" || field === "lunch") {
        copy[i].hours = calcHours(copy[i].start, copy[i].finish, copy[i].lunch);
      }

      return copy;
    });
  };

  const addRole = () => {
    const r = (newRole || "").trim();
    if (!r) return;

    const allLower = new Set([
      ...DEFAULT_ROLES.map((x) => x.toLowerCase()),
      ...(customRoles || []).map((x) => String(x || "").trim().toLowerCase()),
    ]);

    if (allLower.has(r.toLowerCase())) {
      setNewRole("");
      return;
    }

    setCustomRoles((prev) => [...prev, r]);
    setNewRole("");
  };

  const onAreaChange = (value) => {
    setSelectedArea(value);
    setSelectedSubArea(NONE);
    setSubAreaFilter("");
  };

  const onWbsMainChange = (value) => {
    setWbsMain(value);
    setWbsSub(NONE);
  };

  const updateCustomFieldAnswer = (fieldId, value) => {
    setCustomFieldAnswers((prev) => ({
      ...(prev || {}),
      [fieldId]: value,
    }));
  };

  const validateCustomFields = () => {
    const fields = appConfig.customFields || [];

    for (const field of fields) {
      if (!field?.required) continue;

      const value = customFieldAnswers?.[field.id];

      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === NONE
      ) {
        Alert.alert(
          "Missing required field",
          `Please complete: ${field.label || "Required field"}`
        );
        return false;
      }
    }

    return true;
  };

  const renderCustomField = (field) => {
    if (!field?.id) return null;

    const value = customFieldAnswers?.[field.id];

    if (field.type === "dropdown") {
      return (
        <View key={field.id} style={styles.box}>
          <Text style={styles.smallLabel}>
            {field.label}
            {field.required ? " *" : ""}
          </Text>

          <View style={styles.pickerWrapInner}>
            <Picker
              selectedValue={value || NONE}
              onValueChange={(v) => updateCustomFieldAnswer(field.id, v)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor="#000"
              mode="dropdown"
            >
              <Picker.Item
                label={`Select ${field.label}`}
                value={NONE}
                color="#000"
              />

              {(field.options || []).map((option) => (
                <Picker.Item
                  key={option}
                  label={option}
                  value={option}
                  color="#000"
                />
              ))}
            </Picker>
          </View>
        </View>
      );
    }

    if (field.type === "yesno") {
      return (
        <View key={field.id} style={styles.box}>
          <Text style={styles.smallLabel}>
            {field.label}
            {field.required ? " *" : ""}
          </Text>

          <View style={styles.pickerWrapInner}>
            <Picker
              selectedValue={value || NONE}
              onValueChange={(v) => updateCustomFieldAnswer(field.id, v)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor="#000"
              mode="dropdown"
            >
              <Picker.Item label="Select answer" value={NONE} color="#000" />
              <Picker.Item label="Yes" value="Yes" color="#000" />
              <Picker.Item label="No" value="No" color="#000" />
            </Picker>
          </View>
        </View>
      );
    }

    const isLongText = field.type === "longtext";

    return (
      <View key={field.id} style={styles.box}>
        <Text style={styles.smallLabel}>
          {field.label}
          {field.required ? " *" : ""}
        </Text>

        <TextInput
          style={[
            styles.input,
            isLongText && { height: 90, textAlignVertical: "top" },
          ]}
          value={value === NONE ? "" : String(value || "")}
          onChangeText={(v) => updateCustomFieldAnswer(field.id, v)}
          placeholder={field.label || "Enter value"}
          placeholderTextColor="#666"
          keyboardType={field.type === "number" ? "number-pad" : "default"}
          multiline={isLongText}
        />
      </View>
    );
  };

  const buildHtml = () => {
    const fullWbs = buildWbsText(wbsMain, wbsSub);

    const logoHtml = appConfig.logoUrl
      ? `<img src="${escapeHtml(appConfig.logoUrl)}" style="height:55px; max-width:140px; object-fit:contain;"/>`
      : `<div style="font-weight:800;font-size:18px;">SiteDiary</div>`;

    const customFieldRows = (appConfig.customFields || [])
      .map((field) => {
        const rawValue = customFieldAnswers?.[field.id];
        const value = cleanCustomFieldValue(rawValue);

        return `
          <tr>
            <td class="label">${escapeHtml(field.label || "")}</td>
            <td>${escapeHtml(value)}</td>
          </tr>
        `;
      })
      .join("");

    const manpowerRows = manpower
      .filter(
        (m) =>
          (m.role && m.role !== NONE) ||
          (m.number || "").trim() !== "" ||
          (m.start || "").trim() !== "" ||
          (m.finish || "").trim() !== ""
      )
      .map((m) => {
        const computedHours =
          (m.hours || "").trim() ||
          calcHours(m.start || "", m.finish || "", m.lunch || "0.5") ||
          "";

        const lunchLabel = m.lunch ? `${m.lunch} hr` : "";

        return `
          <tr>
            <td>${escapeHtml(m.role === NONE ? "" : m.role || "")}</td>
            <td>${escapeHtml(m.number || "")}</td>
            <td>${escapeHtml(lunchLabel)}</td>
            <td>${escapeHtml(computedHours)}</td>
            <td>${escapeHtml(normalizeTimeForCalc(m.start || ""))}</td>
            <td>${escapeHtml(normalizeTimeForCalc(m.finish || ""))}</td>
          </tr>
        `;
      })
      .join("");

    const materialRows = materials
      .filter(
        (m) =>
          (m.description || "").trim() !== "" ||
          (m.qty || "").trim() !== "" ||
          (m.uom && m.uom !== NONE) ||
          (m.specification || "").trim() !== ""
      )
      .map(
        (m) => `
          <tr>
            <td>${escapeHtml(m.description || "")}</td>
            <td>${escapeHtml(m.qty || "")}</td>
            <td>${escapeHtml(m.uom === NONE ? "" : m.uom || "")}</td>
            <td>${escapeHtml(m.specification || "")}</td>
          </tr>
        `
      )
      .join("");

    const plantRows = plantEquipment
      .filter(
        (p) =>
          (p.description || "").trim() !== "" ||
          (p.number || "").trim() !== ""
      )
      .map(
        (p) => `
          <tr>
            <td>${escapeHtml(p.description || "")}</td>
            <td>${escapeHtml(p.number || "")}</td>
          </tr>
        `
      )
      .join("");

    const tasksHtml = tasks
      .map((t) => (t || "").trim())
      .filter((t) => t.length > 0)
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");

    const manpowerBody =
      manpowerRows ||
      `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;

    const materialBody =
      materialRows || `<tr><td></td><td></td><td></td><td></td></tr>`;

    const plantBody = plantRows || `<tr><td></td><td></td></tr>`;
    const tasksBody = tasksHtml || `<li></li>`;

    const subAreaRow = areaRequiresSubArea
      ? `<tr><td class="label">SUB AREA</td><td>${escapeHtml(
          selectedSubArea === NONE ? "" : selectedSubArea
        )}</td></tr>`
      : "";

    const customFieldsTable = customFieldRows
      ? `
        <div class="section">1.1 Additional Company Fields</div>
        <table>
          ${customFieldRows}
        </table>
      `
      : "";

    return `
      <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color:#000; padding: 16px; }
          table { width:100%; border-collapse: collapse; margin-bottom: 12px; }
          td, th { border:1px solid #000; padding:6px; vertical-align: top; }
          .no-border td { border:none; }
          .title { font-weight: 700; font-size: 16px; text-align: right; }
          .section { font-weight: 700; color: red; margin: 10px 0 6px; }
          .label { font-weight: 700; width: 180px; }
          ul { margin: 0; padding-left: 18px; }
          li { margin-bottom: 4px; }
        </style>
      </head>
      <body>
        <table class="no-border">
          <tr>
            <td style="width: 140px;">${logoHtml}</td>
            <td class="title">DAILY SITE PRODUCTION REPORT</td>
          </tr>
        </table>

        <table>
          <tr><td class="label">COMPANY</td><td>${escapeHtml(
            companyConnection?.companyName || appConfig.companyName || "SiteDiary"
          )}</td></tr>
          <tr><td class="label">PROJECT</td><td>${escapeHtml(project)}</td></tr>
          <tr><td class="label">Date</td><td>${escapeHtml(date)}</td></tr>
          <tr><td class="label">Supervisor/Foreman Name</td><td>${escapeHtml(supervisorName)}</td></tr>
          <tr><td class="label">WBS</td><td>${escapeHtml(fullWbs)}</td></tr>
          <tr><td class="label">AREA</td><td>${escapeHtml(
            selectedArea === NONE ? "" : selectedArea
          )}</td></tr>
          ${subAreaRow}
        </table>

        ${customFieldsTable}

        <div class="section">2.1 Manpower Breakdown</div>
        <table>
          <tr>
            <th>Resource</th>
            <th>Number</th>
            <th>Lunch</th>
            <th>Hours worked</th>
            <th>Start</th>
            <th>Finish</th>
          </tr>
          ${manpowerBody}
        </table>

        <div class="section">2.2 Progress of the Day / Task Performed</div>
        <table>
          <tr><th>Task Performed for the day</th></tr>
          <tr><td><ul>${tasksBody}</ul></td></tr>
        </table>

        <div class="section">2.3 Materials Used</div>
        <table>
          <tr>
            <th>Material Description</th>
            <th>QTY</th>
            <th>UOM</th>
            <th>Specification / Size</th>
          </tr>
          ${materialBody}
        </table>

        <div class="section">2.4 Plant / Equipment Used</div>
        <table>
          <tr><th>Plant / Equipment Description</th><th>Number / ID</th></tr>
          ${plantBody}
        </table>

        <div class="section">3. Issues / Delays / Standing Time / Design Change / Instructions</div>
        <table>
          <tr><td style="height: 90px;">${escapeHtml(issues || "")}</td></tr>
        </table>

        <div style="font-size:11px;margin-top:12px;">
          Generated via SiteDiary – Daily Supervisor Report.
        </div>
      </body>
      </html>
    `;
  };

  const submitDiary = async () => {
    try {
      if (!companyConnection?.companyId) {
        Alert.alert("Not connected", "Please connect the app to a company first.");
        return;
      }

      if (!supervisorName.trim()) {
        Alert.alert("Missing supervisor name", "Please enter supervisor name.");
        return;
      }

      if (!wbsMain || wbsMain === NONE || !wbsSub || wbsSub === NONE) {
        Alert.alert(
          "Missing WBS",
          "Please select the WBS main item and sub item."
        );
        return;
      }

      if (!selectedArea || selectedArea === NONE) {
        Alert.alert("Missing area", "Please select an area.");
        return;
      }

      if (
        areaRequiresSubArea &&
        (!selectedSubArea || selectedSubArea === NONE)
      ) {
        Alert.alert("Missing sub area", "Please select a sub area.");
        return;
      }

      if (!validateCustomFields()) return;

      setIsSubmitting(true);

      Alert.alert(
        "Submitting",
        "Generating PDF, uploading to Dashboard, and opening share options..."
      );

      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html });

      const diaryRef = doc(
        db,
        "companies",
        companyConnection.companyId,
        "diaries",
        `${Date.now()}_${sanitizeFilePart(supervisorName)}`
      );

      const diaryId = diaryRef.id;

      const safeSupervisor = sanitizeFilePart(supervisorName || "Supervisor");
      const year = (date || todayISO).slice(0, 4);
      const month = (date || todayISO).slice(5, 7);
      const fileName = `SiteDiary_${date}_${safeSupervisor}.pdf`;

      const storagePath = `companies/${companyConnection.companyId}/diaries/${year}/${month}/${diaryId}_${fileName}`;

      const localSharePath = FileSystem.documentDirectory + fileName;

      await FileSystem.copyAsync({
        from: uri,
        to: localSharePath,
      });

      const pdfResponse = await fetch(uri);
      const pdfBlob = await pdfResponse.blob();

      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, pdfBlob, {
        contentType: "application/pdf",
      });

      const pdfUrl = await getDownloadURL(storageRef);

      const totalManpowerHours = sumManpowerHours(manpower);

      const filteredTasks = (tasks || [])
        .map((t) => String(t || "").trim())
        .filter(Boolean);

      const filteredMaterials = (materials || []).filter(
        (m) =>
          (m.description || "").trim() ||
          (m.qty || "").trim() ||
          ((m.uom || "").trim() && m.uom !== NONE) ||
          (m.specification || "").trim()
      );

      const filteredPlantEquipment = (plantEquipment || []).filter(
        (p) => (p.description || "").trim() || (p.number || "").trim()
      );

      const customFieldsForPayload = (appConfig.customFields || []).map(
        (field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required === true,
          value: cleanCustomFieldValue(customFieldAnswers?.[field.id]),
        })
      );

      const payload = {
        diaryId,

        companyId: companyConnection.companyId,
        companyName: companyConnection.companyName,

        project: project || appConfig.projectName || DEFAULT_APP_CONFIG.projectName,
        date,
        supervisorName: supervisorName.trim(),

        wbsMain,
        wbsSub,
        wbsText: buildWbsText(wbsMain, wbsSub),

        selectedArea,
        selectedSubArea: areaRequiresSubArea ? selectedSubArea : "",

        customFieldAnswers,
        customFields: customFieldsForPayload,

        manpower,
        tasks: filteredTasks,
        materials: filteredMaterials,
        plantEquipment: filteredPlantEquipment,
        issues: issues || "",

        hasIssues: Boolean((issues || "").trim()),
        manpowerCount: manpower.length,
        taskCount: filteredTasks.length,
        materialCount: filteredMaterials.length,
        plantEquipmentCount: filteredPlantEquipment.length,
        customFieldCount: customFieldsForPayload.length,
        totalManpowerHours,

        pdfUrl,
        pdfPath: storagePath,
        pdfFileName: fileName,

        submittedAtISO: new Date().toISOString(),
        createdAt: serverTimestamp(),
      };

      await setDoc(diaryRef, payload);

      const snapshot = {
        project,
        supervisorName,
        wbsMain,
        wbsSub,
        selectedArea,
        selectedSubArea,
        customRoles,
        customFieldAnswers,
        manpower,
        tasks,
        materials,
        plantEquipment,
        issues,
      };

      await AsyncStorage.setItem(LAST_DIARY_KEY, JSON.stringify(snapshot));
      await AsyncStorage.setItem(
        LEGACY_LAST_DIARY_KEY,
        JSON.stringify(snapshot)
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localSharePath, {
          mimeType: "application/pdf",
          dialogTitle: "Share Site Diary PDF",
          UTI: "com.adobe.pdf",
        });
      }

      Alert.alert(
        "Success",
        "Diary submitted successfully to the company dashboard."
      );
    } catch (e) {
      console.log("Submit diary error:", e);
      Alert.alert(
        "Submission error",
        `Could not submit diary.\n\n${e?.message || "Unknown error"}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centerScreen}>
          <Text style={styles.title}>SiteDiary</Text>
          <Text style={styles.subtitle}>Loading company connection...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!companyConnection) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>SiteDiary</Text>
            <Text style={styles.subtitle}>Connect app to company dashboard</Text>
          </View>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoPlaceholderText}>SiteDiary</Text>
          </View>
        </View>

        <View style={styles.container}>
          <Text style={styles.label}>Company Name</Text>
          <TextInput
            style={styles.input}
            value={companyNameInput}
            onChangeText={setCompanyNameInput}
            placeholder="Enter company name exactly"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>6-Digit Access Code</Text>
          <TextInput
            style={styles.input}
            value={accessCodeInput}
            onChangeText={setAccessCodeInput}
            placeholder="Enter access code"
            placeholderTextColor="#666"
            keyboardType="number-pad"
            maxLength={6}
          />

          <TouchableOpacity
            style={styles.submit}
            onPress={connectToCompany}
            disabled={connectingCompany}
          >
            <Text style={styles.submitText}>
              {connectingCompany ? "Connecting..." : "Connect to Dashboard"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SiteDiary</Text>
          <Text style={styles.subtitle}>
            {companyConnection?.companyName || appConfig.companyName}
          </Text>
        </View>

        {appConfig.logoUrl ? (
          <Image source={{ uri: appConfig.logoUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoPlaceholderText}>SiteDiary</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <TouchableOpacity
            style={styles.connectedBox}
            onPress={disconnectCompany}
          >
            <Text style={styles.connectedText}>
              Connected to: {companyConnection.companyName}
            </Text>
            <Text style={styles.connectedSmallText}>
              Tap here to disconnect this device
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>PROJECT</Text>
          <TextInput
            style={styles.input}
            value={project}
            onChangeText={setProject}
            placeholder="Enter project name"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Supervisor Name</Text>
          <TextInput
            style={styles.input}
            value={supervisorName}
            onChangeText={setSupervisorName}
            placeholder="Full Names"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>WBS Main</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={wbsMain}
              onValueChange={onWbsMainChange}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor="#000"
              mode="dropdown"
            >
              <Picker.Item label="Select WBS main" value={NONE} color="#000" />
              {wbsMainOptions
                .filter((item) => item !== NONE)
                .map((item) => (
                  <Picker.Item
                    key={item}
                    label={item}
                    value={item}
                    color="#000"
                  />
                ))}
            </Picker>
          </View>

          <Text style={styles.label}>WBS Sub</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={wbsSub}
              onValueChange={setWbsSub}
              enabled={wbsMain !== NONE}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor="#000"
              mode="dropdown"
            >
              <Picker.Item label="Select WBS sub" value={NONE} color="#000" />
              {wbsSubOptions
                .filter((item) => item !== NONE)
                .map((item) => (
                  <Picker.Item
                    key={item}
                    label={item}
                    value={item}
                    color="#000"
                  />
                ))}
            </Picker>
          </View>

          <Text style={styles.label}>Filter Areas</Text>
          <TextInput
            style={styles.input}
            value={areaFilter}
            onChangeText={setAreaFilter}
            placeholder="Type to filter area list"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Area Description</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={selectedArea}
              onValueChange={onAreaChange}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor="#000"
              mode="dropdown"
            >
              <Picker.Item label="Select area" value={NONE} color="#000" />
              {filteredAreas.map((area) => (
                <Picker.Item
                  key={area.name}
                  label={area.name}
                  value={area.name}
                  color="#000"
                />
              ))}
            </Picker>
          </View>

          {areaRequiresSubArea && (
            <>
              <Text style={styles.label}>Filter Sub Areas</Text>
              <TextInput
                style={styles.input}
                value={subAreaFilter}
                onChangeText={setSubAreaFilter}
                placeholder="Type to filter sub area list"
                placeholderTextColor="#666"
                editable={selectedArea !== NONE}
              />

              <Text style={styles.label}>Sub Area</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={selectedSubArea}
                  onValueChange={setSelectedSubArea}
                  enabled={selectedArea !== NONE}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor="#000"
                  mode="dropdown"
                >
                  <Picker.Item
                    label="Select sub area"
                    value={NONE}
                    color="#000"
                  />
                  {filteredSubAreas.map((item) => (
                    <Picker.Item
                      key={item}
                      label={item}
                      value={item}
                      color="#000"
                    />
                  ))}
                </Picker>
              </View>
            </>
          )}

          {(appConfig.customFields || []).length > 0 && (
            <>
              <SectionTitle>Additional Company Fields</SectionTitle>
              {(appConfig.customFields || []).map((field) =>
                renderCustomField(field)
              )}
            </>
          )}

          <SectionTitle>Manpower Breakdown</SectionTitle>

          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={newRole}
              onChangeText={setNewRole}
              placeholder="Add role e.g. Welder"
              placeholderTextColor="#666"
            />
            <TouchableOpacity style={styles.blackButtonSmall} onPress={addRole}>
              <Text style={styles.blackButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {manpower.map((m, i) => (
            <View key={i} style={styles.box}>
              <Text style={styles.smallLabel}>Resource</Text>
              <View style={styles.pickerWrapInner}>
                <Picker
                  selectedValue={m.role}
                  onValueChange={(v) => updateManpower(i, "role", v)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor="#000"
                  mode="dropdown"
                >
                  {ROLES.map((r) => (
                    <Picker.Item
                      key={r}
                      label={r === NONE ? "Select role" : r}
                      value={r}
                      color="#000"
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.smallLabel}>Number</Text>
              <TextInput
                style={styles.input}
                value={m.number}
                onChangeText={(v) => updateManpower(i, "number", v)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#666"
              />

              <Text style={styles.smallLabel}>Start Time</Text>
              <TimeInput
                value={m.start}
                onChangeText={(v) => updateManpower(i, "start", v)}
                placeholder={appConfig.shiftStart?.replace(":", "") || "0700"}
              />

              <Text style={styles.smallLabel}>Finish Time</Text>
              <TimeInput
                value={m.finish}
                onChangeText={(v) => updateManpower(i, "finish", v)}
                placeholder={appConfig.shiftEnd?.replace(":", "") || "1630"}
              />

              <Text style={styles.smallLabel}>Lunch Time</Text>
              <View style={styles.pickerWrapInner}>
                <Picker
                  selectedValue={m.lunch || "0.5"}
                  onValueChange={(v) => updateManpower(i, "lunch", v)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor="#000"
                  mode="dropdown"
                >
                  {LUNCH_OPTIONS.map((o) => (
                    <Picker.Item
                      key={o.value}
                      label={o.label}
                      value={o.value}
                      color="#000"
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.smallLabel}>Hours Worked Auto</Text>
              <TextInput style={styles.input} editable={false} value={m.hours} />
            </View>
          ))}

          <TouchableOpacity
            style={styles.blackButton}
            onPress={() =>
              setManpower((prev) => [
                ...prev,
                {
                  role: NONE,
                  number: "",
                  start: "",
                  finish: "",
                  lunch: "0.5",
                  hours: "",
                },
              ])
            }
          >
            <Text style={styles.blackButtonText}>Add Manpower</Text>
          </TouchableOpacity>

          <SectionTitle>Progress of the Day / Task Performed</SectionTitle>

          {tasks.map((t, i) => (
            <View key={i} style={styles.box}>
              <TextInput
                style={styles.input}
                value={t}
                onChangeText={(v) => {
                  const copy = [...tasks];
                  copy[i] = v;
                  setTasks(copy);
                }}
                placeholder={`Task ${i + 1}`}
                placeholderTextColor="#666"
              />
            </View>
          ))}

          <TouchableOpacity
            style={styles.blackButton}
            onPress={() => setTasks((prev) => [...prev, ""])}
          >
            <Text style={styles.blackButtonText}>Add Task</Text>
          </TouchableOpacity>

          <SectionTitle>Materials Used</SectionTitle>

          {materials.map((m, i) => (
            <View key={i} style={styles.box}>
              <Text style={styles.smallLabel}>Material Description</Text>
              <View style={styles.pickerWrapInner}>
                <Picker
                  selectedValue={m.description || NONE}
                  onValueChange={(v) => {
                    const copy = [...materials];
                    const selectedMaterial = (appConfig.materials || []).find(
                      (mat) => mat.name === v
                    );

                    copy[i] = {
                      ...copy[i],
                      description: v === NONE ? "" : v,
                      uom: selectedMaterial?.unit || copy[i].uom || NONE,
                    };

                    setMaterials(copy);
                  }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor="#000"
                  mode="dropdown"
                >
                  <Picker.Item
                    label="Select material"
                    value={NONE}
                    color="#000"
                  />
                  {materialOptions
                    .filter((item) => item !== NONE)
                    .map((item) => (
                      <Picker.Item
                        key={item}
                        label={item}
                        value={item}
                        color="#000"
                      />
                    ))}
                </Picker>
              </View>

              <TextInput
                style={styles.input}
                value={m.qty}
                onChangeText={(v) => {
                  const copy = [...materials];
                  copy[i] = { ...copy[i], qty: v };
                  setMaterials(copy);
                }}
                placeholder="QTY"
                placeholderTextColor="#666"
                keyboardType="number-pad"
              />

              <Text style={styles.smallLabel}>UOM</Text>
              <View style={styles.pickerWrapInner}>
                <Picker
                  selectedValue={m.uom || NONE}
                  onValueChange={(v) => {
                    const copy = [...materials];
                    copy[i] = { ...copy[i], uom: v };
                    setMaterials(copy);
                  }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor="#000"
                  mode="dropdown"
                >
                  <Picker.Item label="Select unit" value={NONE} color="#000" />
                  {uomOptions
                    .filter((u) => u !== NONE)
                    .map((u) => (
                      <Picker.Item key={u} label={u} value={u} color="#000" />
                    ))}
                </Picker>
              </View>

              <TextInput
                style={styles.input}
                value={m.specification}
                onChangeText={(v) => {
                  const copy = [...materials];
                  copy[i] = { ...copy[i], specification: v };
                  setMaterials(copy);
                }}
                placeholder="Specification / Size"
                placeholderTextColor="#666"
              />
            </View>
          ))}

          <TouchableOpacity
            style={styles.blackButton}
            onPress={() =>
              setMaterials((prev) => [
                ...prev,
                { description: "", qty: "", uom: NONE, specification: "" },
              ])
            }
          >
            <Text style={styles.blackButtonText}>Add Material</Text>
          </TouchableOpacity>

          <SectionTitle>Plant / Equipment Used</SectionTitle>

          {plantEquipment.map((p, i) => (
            <View key={i} style={styles.box}>
              <TextInput
                style={styles.input}
                value={p.description}
                onChangeText={(v) => {
                  const copy = [...plantEquipment];
                  copy[i] = { ...copy[i], description: v };
                  setPlantEquipment(copy);
                }}
                placeholder="Plant/Equipment description"
                placeholderTextColor="#666"
              />
              <TextInput
                style={styles.input}
                value={p.number}
                onChangeText={(v) => {
                  const copy = [...plantEquipment];
                  copy[i] = { ...copy[i], number: v };
                  setPlantEquipment(copy);
                }}
                placeholder="Number / ID optional"
                placeholderTextColor="#666"
              />
            </View>
          ))}

          <TouchableOpacity
            style={styles.blackButton}
            onPress={() =>
              setPlantEquipment((prev) => [
                ...prev,
                { description: "", number: "" },
              ])
            }
          >
            <Text style={styles.blackButtonText}>Add Plant / Equipment</Text>
          </TouchableOpacity>

          <SectionTitle>Issues / Delays</SectionTitle>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            multiline
            value={issues}
            onChangeText={setIssues}
            placeholder="Write any delays / instructions"
            placeholderTextColor="#666"
          />

          <TouchableOpacity
            style={[styles.submit, isSubmitting && { opacity: 0.7 }]}
            onPress={submitDiary}
            disabled={isSubmitting}
          >
            <Text style={styles.submitText}>
              {isSubmitting ? "Submitting..." : "Generate PDF and Submit"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  centerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  header: {
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 6 : 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 150,
    height: 60,
    resizeMode: "contain",
    marginLeft: 10,
  },
  logoPlaceholder: {
    width: 150,
    height: 60,
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  logoPlaceholderText: {
    fontWeight: "900",
    color: "#000",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#000" },
  subtitle: { fontSize: 12, color: "#222", marginTop: 2 },
  container: { padding: 16, paddingBottom: 40 },
  connectedBox: {
    borderWidth: 1,
    borderColor: "#000",
    padding: 10,
    borderRadius: 6,
    marginBottom: 14,
    backgroundColor: "#fff",
  },
  connectedText: {
    fontWeight: "900",
    color: "#000",
  },
  connectedSmallText: {
    fontSize: 11,
    color: "#444",
    marginTop: 3,
  },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, color: "#000" },
  smallLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    color: "#000",
  },
  input: {
    borderWidth: 1,
    borderColor: "#000",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
    borderRadius: 6,
    color: "#000",
    backgroundColor: "#fff",
  },
  box: {
    borderWidth: 1,
    borderColor: "#000",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 6,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  pickerWrapInner: {
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 6,
    marginBottom: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  picker: {
    color: "#000",
    backgroundColor: "#fff",
  },
  pickerItem: {
    color: "#000",
    backgroundColor: "#fff",
  },
  redSection: {
    color: "red",
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 8,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  blackButton: {
    backgroundColor: "#000",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  blackButtonSmall: {
    backgroundColor: "#000",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  blackButtonText: { color: "#fff", fontWeight: "800" },
  submit: {
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 14,
  },
  submitText: { color: "#fff", fontWeight: "900" },
}); 