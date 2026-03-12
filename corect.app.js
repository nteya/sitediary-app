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

const adventOneLogo = require("./assets/adventone.png");
// ✅ Production-safe embedded logo for PDF - KEEP YOUR EXISTING BASE64 HERE
const ADVENTONE_LOGO_BASE64 = `
iVBORw0KGgoAAAANSUhEUgAAAZAAAAEKCAYAAAA8QgPpAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAF7cSURBVHhe7b13gFzXdd//Pfe96bNTtmMXHSAIggBIsJgiKQqULEW25KgPZTtuKU6cxM7PTRRFldU6clGzE9uJ7TiJW+zYWFkuklVMWSKoWKYkSiJBEiSI3rHA9jbt3Xt+f9x738wuAXJBsWLPh8TuzJv33tx5++Z87/eeWwBBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEARBEAThlQYt3SAIgiAIgiAIgvCCEBaLKDkXIk5EEJaglm4QBAEBAFq1atWtueyq3wfAIiCC8HREQARhCUNDQwyA8/n8Tw4OrnlXsVi8AYBxwiIIgiAIF0UBoFwut3PnzusX7njNa82GDZv+DlZYpMIlCIIgXJxKpRIAwMYNG//41ltv51tedVv9+utvNPl8/jVuF3EhguCQGpUgtFAjIyMml8jtLBTLFWY2xhjKZrPU39v/PrSatwRBkNqUILSoVCpq//79Zs36tb9eKnfu0lGkQRQSyIRhuHl2bvbL991333H3vREhEVY84kAEwRKMjIzoXC63s1AovYONMSAKiAhaa85kc6qvp09ciCC0IQ5EEFrugwcH1/x6udy1SxutiVRgO/CSYsCoMLi6Njuz94v33XdUXIggiAMRBHj3kc0Wry8UyxXDxrjvBoOICIDRmnPZHLp6++6BuBBBAMSBCELLfaxZs/qT5c6u67XWmogUwADbQehEUAyYZCKxuTY3+w9fkFyIIIgDEVY8tudVrrSzUCi9yxjDccWKadEkJkZrZLI56uzpuxfiQgRBHIiwwhkaIuzdy4MDA58sd3XtMlprAgVEAPnJS9hpCBGBYFQQbp6fm9173333HRMXIqxkxIEIKxmF4WGTzRavL5XL7zLG2OlKCMxtE2ARAUy2HcsYY3LZnOrq6hEXIqx4xIEIKxaf+1g9OPA7nZ1d27XW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
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
  const [project, setProject] = useState(""); // NEW: Project field

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

          // restore everything
          setProject(saved.project || ""); // NEW: Load project
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
        project, // NEW: Save project
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
    project, // NEW: Include project in dependencies
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

      const logoBase64 = ADVENTONE_LOGO_BASE64;

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
            <tr><td class="label">PROJECT</td><td>${escapeHtml(project)}</td></tr>
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

      // ✅ Show sharing dialog but it will primarily show File Manager/Downloads
      // On Android, this will show "Save to Files" option
      // On iOS, this will show the share sheet with "Save to Files" option
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Create a better filename
        const fileName = `SiteDiary_${date}_${supervisorName.replace(/\s+/g, '_')}.pdf`;
        
        // Copy to a temp location with proper name
        const tempUri = `${FileSystem.documentDirectory}${fileName}`;
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(tempUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Share with File Manager focus
        await Sharing.shareAsync(tempUri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
          dialogTitle: "Save PDF to Files",
          filename: fileName,
        });
      } else {
        Alert.alert(
          "PDF Generated",
          "PDF has been generated. Please use a file manager app to save it.",
          [
            {
              text: "OK",
              onPress: () => console.log("PDF generated at:", uri)
            }
          ]
        );
      }

      // Save snapshot after PDF generation
      await AsyncStorage.setItem(
        "LAST_DIARY",
        JSON.stringify({
          date: todayISO,
          project, // NEW: Save project
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
          
          {/* NEW: PROJECT FIELD */}
          <Text style={styles.label}>PROJECT</Text>
          <TextInput
            style={styles.input}
            value={project}
            onChangeText={setProject}
            placeholder="Enter project name"
            placeholderTextColor="#888"
          />

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
            <Text style={styles.submitText}>Generate and Save PDF</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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