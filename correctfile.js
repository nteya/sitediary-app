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
// ✅ Use NEW expo-file-system (works in Expo Go + APK)

import { Picker } from "@react-native-picker/picker";


const adventOneLogo = require("./assets/adventone.png");
// ✅ Production-safe embedded logo for PDF
const ADVENTONE_LOGO_BASE64 = `
PASTE_BASE64_HERE
`;


// STORAGE KEYS
const LAST_DIARY_KEY = "lastDiary";

// ✅ Android production-safe empty value for Pickers
const NONE = "__NONE__";

// Roles (same labels, same meaning)
const ROLES = [
  NONE,
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

// Time helpers
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

function calcHours(start, finish) {
  const s = normalizeTimeForCalc(start);
  const f = normalizeTimeForCalc(finish);
  if (!s || !f || s.length !== 5 || f.length !== 5) return "";

  const [sh, sm] = s.split(":").map(Number);
  const [fh, fm] = f.split(":").map(Number);
  if ([sh, sm, fh, fm].some((n) => Number.isNaN(n))) return "";

  const startVal = sh + sm / 60;
  const finishVal = fh + fm / 60;

  const diff = finishVal - startVal;
  return diff > 0 ? diff.toFixed(2) : "";
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
      placeholderTextColor="#888"
      keyboardType="number-pad"
      maxLength={5}
    />
  );
};

export default function App() {
  const todayISO = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [date, setDate] = useState(todayISO);

  // Header fields
  const [supervisorName, setSupervisorName] = useState("");
  const [wbs, setWbs] = useState("");
  const [cwpNo, setCwpNo] = useState("");

  // Areas
  const [areas, setAreas] = useState([]);
  // ✅ default NONE to avoid Android picker blank bug
  const [selectedArea, setSelectedArea] = useState(NONE);
  const [newArea, setNewArea] = useState("");

  // Tables
  const [manpower, setManpower] = useState([
    // ✅ role default NONE to avoid Android picker blank bug
    { role: NONE, number: "", start: "", finish: "", hours: "", equipment: "" },
  ]);

  const [tasks, setTasks] = useState([""]);
  const [materials, setMaterials] = useState([{ description: "", qty: "" }]);
  const [issues, setIssues] = useState("");

  // 🔥 Load last saved diary
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_DIARY_KEY);
        if (raw) {
          const saved = JSON.parse(raw);

          // restore everything except date
          setSupervisorName(saved.supervisorName || "");
          setWbs(saved.wbs || "");
          setCwpNo(saved.cwpNo || "");

          setAreas(saved.areas || []);

          // ✅ keep older saved "" compatible, but force NONE if empty
          const loadedArea = saved.selectedArea || "";
          setSelectedArea(loadedArea.trim() ? loadedArea : NONE);

          // ✅ keep older saved manpower compatible, but force NONE if empty
          const loadedManpower = saved.manpower || [
            { role: NONE, number: "", start: "", finish: "", hours: "", equipment: "" },
          ];
          setManpower(
            loadedManpower.map((row) => ({
              role: (row.role || "").trim() ? row.role : NONE,
              number: row.number || "",
              start: row.start || "",
              finish: row.finish || "",
              hours: row.hours || "",
              equipment: row.equipment || "",
            }))
          );

          setTasks(saved.tasks || [""]);
          setMaterials(saved.materials || [{ description: "", qty: "" }]);
          setIssues(saved.issues || "");
        }
      } catch (e) {
        console.log("Load diary error:", e);
      }
    })();
  }, []);

  // 🔥 Auto-save diary whenever anything changes
  useEffect(() => {
    const save = async () => {
      const diary = {
        supervisorName,
        wbs,
        cwpNo,
        areas,
        selectedArea,
        manpower,
        tasks,
        materials,
        issues,
      };
      await AsyncStorage.setItem(LAST_DIARY_KEY, JSON.stringify(diary));
    };
    save();
  }, [
    supervisorName,
    wbs,
    cwpNo,
    areas,
    selectedArea,
    manpower,
    tasks,
    materials,
    issues,
  ]);

  // Update manpower row
  const updateManpower = (i, field, value) => {
    setManpower((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [field]: value };

      if (field === "start" || field === "finish") {
        const hours = calcHours(copy[i].start, copy[i].finish);
        copy[i].hours = hours;
      }
      return copy;
    });
  };

  // Add Area
  const addArea = () => {
    const a = (newArea || "").trim();
    if (!a) return;

    const exists = areas.some((x) => x.toLowerCase() === a.toLowerCase());
    if (exists) {
      setSelectedArea(
        areas.find((x) => x.toLowerCase() === a.toLowerCase())
      );
      setNewArea("");
      return;
    }

    const updated = [...areas, a];
    setAreas(updated);
    setSelectedArea(a);
    setNewArea("");
  };

  /* ----------------------- PDF GENERATION ------------------------ */
  const exportPDF = async () => {
    try {
      if (!supervisorName.trim()) {
        Alert.alert("Missing supervisor name", "Please enter supervisor name.");
        return;
      }
      // ✅ treat NONE as empty
      if (selectedArea === NONE || !String(selectedArea).trim()) {
        Alert.alert("Missing area", "Please select or add an area description.");
        return;
      }

      Alert.alert("Generating PDF", "Please wait...");

      // ✅ PRODUCTION + EXPO FIX:
      // Read logo as base64 using expo-file-system (no legacy, no fetch/blob)
 const logoBase64 = ADVENTONE_LOGO_BASE64;


      // ⛔ STOP HERE — PART 2 continues from this point with the SAME HTML
      const manpowerRows = manpower
        .filter(
          (m) =>
            (m.role && m.role !== NONE) ||
            (m.number || "").trim() !== ""
        )
        .map(
          (m) => `
          <tr>
            <td>${escapeHtml(m.role || "")}</td>
            <td>${escapeHtml(m.number || "")}</td>
            <td>${escapeHtml(m.hours || "")}</td>
            <td>${escapeHtml(normalizeTimeForCalc(m.start || ""))}</td>
            <td>${escapeHtml(normalizeTimeForCalc(m.finish || ""))}</td>
            <td>${escapeHtml(m.equipment || "")}</td>
          </tr>
        `
        )
        .join("");

      // ... PART 2 continues exactly from here (no changes)
      const materialRows = materials
        .filter(
          (m) =>
            (m.description || "").trim() !== "" ||
            (m.qty || "").trim() !== ""
        )
        .map(
          (m) => `
          <tr>
            <td>${escapeHtml(m.description || "")}</td>
            <td>${escapeHtml(m.qty || "")}</td>
          </tr>
        `
        )
        .join("");

      const tasksHtml = (tasks || [])
        .map((t) => (t || "").trim())
        .filter((t) => t.length > 0)
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join("");

      const manpowerBody =
        manpowerRows ||
        `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;

      const materialBody =
        materialRows || `<tr><td></td><td></td></tr>`;

      const tasksBody = tasksHtml || `<li></li>`;

      const html = `
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
              <td style="width: 140px;">
                <img src="data:image/png;base64,${logoBase64}" style="height:55px;"/>
              </td>
              <td class="title">DAILY SITE PRODUCTION REPORT</td>
            </tr>
          </table>

          <table>
            <tr><td class="label">Date</td><td>${escapeHtml(date)}</td></tr>
            <tr><td class="label">Supervisor/Foreman Name</td><td>${escapeHtml(supervisorName)}</td></tr>
            <tr><td class="label">WBS</td><td>${escapeHtml(wbs)}</td></tr>
            <tr><td class="label">CWP No</td><td>${escapeHtml(cwpNo)}</td></tr>
            <tr><td class="label">AREA DESCRIPTION</td><td>${escapeHtml(selectedArea)}</td></tr>
          </table>

          <div class="section">2.1 Manpower Breakdown</div>
          <table>
            <tr>
              <th>Resource</th>
              <th>Number</th>
              <th>Hours worked</th>
              <th>Start</th>
              <th>Finish</th>
              <th>Plant/Equipment Number</th>
            </tr>
            ${manpowerBody}
          </table>

          <div class="section">2.2 Progress of the Day / Task Performed</div>
          <table>
            <tr>
              <th>Task Performed for the day</th>
            </tr>
            <tr>
              <td>
                <ul>
                  ${tasksBody}
                </ul>
              </td>
            </tr>
          </table>

          <div class="section">2.3 Materials Used</div>
          <table>
            <tr><th>Material Description</th><th>QTY</th></tr>
            ${materialBody}
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

      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
        });
      } else {
        Alert.alert("PDF created", "PDF generated successfully.");
      }

      // Save snapshot after PDF generation
      await AsyncStorage.setItem(
        "LAST_DIARY",
        JSON.stringify({
          date: todayISO,
          supervisorName,
          wbs,
          cwpNo,
          selectedArea,
          areas,
          manpower,
          tasks,
          materials,
          issues,
        })
      );

    } catch (e) {
      console.log("PDF export error:", e);
      Alert.alert(
        "PDF error",
        `Could not generate PDF.\n\n${e?.message || "Unknown error"}`
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SiteDiary</Text>
          <Text style={styles.subtitle}>Daily Site Production Report</Text>
        </View>
        <Image source={adventOneLogo} style={styles.logo} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>

          {/* DATE */}
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#888"
          />

          {/* SUPERVISOR */}
          <Text style={styles.label}>Supervisor Name</Text>
          <TextInput
            style={styles.input}
            value={supervisorName}
            onChangeText={setSupervisorName}
            placeholder="Full Names"
            placeholderTextColor="#888"
          />

          {/* WBS */}
          <Text style={styles.label}>WBS</Text>
          <TextInput
            style={styles.input}
            value={wbs}
            onChangeText={setWbs}
            placeholder="e.g. 123-ABC"
            placeholderTextColor="#888"
          />

          {/* CWP */}
          <Text style={styles.label}>CWP No</Text>
          <TextInput
            style={styles.input}
            value={cwpNo}
            onChangeText={setCwpNo}
            placeholder="e.g. CWP-001"
            placeholderTextColor="#888"
          />

          {/* AREA DESCRIPTION */}
          <Text style={styles.label}>Area Description</Text>
          <View style={styles.box}>
            <Picker
              selectedValue={selectedArea}
              onValueChange={setSelectedArea}
              style={{ color: "#000", backgroundColor: "#fff" }}
              itemStyle={{ color: "#000" }}
            >
              <Picker.Item label="Select area" value={NONE} color="#000" />
              {areas.map((a) => (
                <Picker.Item key={a} label={a} value={a} color="#000" />
              ))}
            </Picker>
          </View>

          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={newArea}
              onChangeText={setNewArea}
              placeholder="Add new area (e.g. DMS)"
              placeholderTextColor="#888"
            />
            <TouchableOpacity style={styles.blackButtonSmall} onPress={addArea}>
              <Text style={styles.blackButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* MANPOWER */}
          <SectionTitle>Manpower Breakdown</SectionTitle>

          {manpower.map((m, i) => (
            <View key={i} style={styles.box}>
              <Text style={styles.smallLabel}>Resource</Text>
              <Picker
                selectedValue={m.role}
                onValueChange={(v) => updateManpower(i, "role", v)}
                style={{ color: "#000", backgroundColor: "#fff" }}
                itemStyle={{ color: "#000" }}
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

              <Text style={styles.smallLabel}>Number</Text>
              <TextInput
                style={styles.input}
                value={m.number}
                onChangeText={(v) => updateManpower(i, "number", v)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#888"
              />

              <Text style={styles.smallLabel}>Start Time</Text>
              <TimeInput
                value={m.start}
                onChangeText={(v) => updateManpower(i, "start", v)}
                placeholder="0700"
              />

              <Text style={styles.smallLabel}>Finish Time</Text>
              <TimeInput
                value={m.finish}
                onChangeText={(v) => updateManpower(i, "finish", v)}
                placeholder="1630"
              />

              <Text style={styles.smallLabel}>Hours Worked (Auto)</Text>
              <TextInput style={styles.input} editable={false} value={m.hours} />

              <Text style={styles.smallLabel}>Plant / Equipment</Text>
              <TextInput
                style={styles.input}
                value={m.equipment}
                onChangeText={(v) => updateManpower(i, "equipment", v)}
                placeholder="Optional"
                placeholderTextColor="#888"
              />
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
                  hours: "",
                  equipment: "",
                },
              ])
            }
          >
            <Text style={styles.blackButtonText}>Add Manpower</Text>
          </TouchableOpacity>

          {/* TASKS */}
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
                placeholderTextColor="#888"
              />
            </View>
          ))}

          <TouchableOpacity
            style={styles.blackButton}
            onPress={() => setTasks((prev) => [...prev, ""])}
          >
            <Text style={styles.blackButtonText}>Add Task</Text>
          </TouchableOpacity>

          {/* MATERIALS */}
          <SectionTitle>Materials Used</SectionTitle>

          {materials.map((m, i) => (
            <View key={i} style={styles.box}>
              <TextInput
                style={styles.input}
                value={m.description}
                onChangeText={(v) => {
                  const copy = [...materials];
                  copy[i] = { ...copy[i], description: v };
                  setMaterials(copy);
                }}
                placeholder="Material description"
                placeholderTextColor="#888"
              />
              <TextInput
                style={styles.input}
                value={m.qty}
                onChangeText={(v) => {
                  const copy = [...materials];
                  copy[i] = { ...copy[i], qty: v };
                  setMaterials(copy);
                }}
                placeholder="QTY"
                placeholderTextColor="#888"
                keyboardType="number-pad"
              />
            </View>
          ))}

          <TouchableOpacity
            style={styles.blackButton}
            onPress={() =>
              setMaterials((prev) => [...prev, { description: "", qty: "" }])
            }
          >
            <Text style={styles.blackButtonText}>Add Material</Text>
          </TouchableOpacity>

          {/* ISSUES */}
          <SectionTitle>Issues / Delays</SectionTitle>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            multiline
            value={issues}
            onChangeText={setIssues}
            placeholder="Write any delays / instructions"
            placeholderTextColor="#888"
          />

          {/* PDF */}
          <TouchableOpacity style={styles.submit} onPress={exportPDF}>
            <Text style={styles.submitText}>Generate PDF</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ⛔ STOP HERE — PART 3 is next (escapeHtml + styles exactly as yours)
/* -------------------- HTML ESCAPER --------------------- */
function escapeHtml(s) {
  if (!s && s !== 0) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -------------------- STYLES --------------------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
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
  title: { fontSize: 22, fontWeight: "800", color: "#000" },
  subtitle: { fontSize: 12, color: "#222", marginTop: 2 },
  container: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  smallLabel: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
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

  