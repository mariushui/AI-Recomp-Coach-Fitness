#!/usr/bin/env python3
"""Erzeugt die Kurzbefehl-Datei "Recomp Health" als unsignierte .shortcut-Datei.

Aufruf:  python3 make_shortcut.py TOKEN ADRESSE [--mit-schwimmen] [--mit-blutzucker] [--nur-stufe-1]
Danach auf dem Mac signieren:  mkdir -p signed && shortcuts sign --mode anyone --input "Recomp Health.shortcut" --output "signed/Recomp Health.shortcut"
und per AirDrop aufs iPhone schicken.

Stufe 1: Gewicht, Körperfett, Ruhepuls, HRV, Schlaf (letzte 7 Tage).
Stufe 2: Schritte, aktive Kalorien, Trainingsminuten (letzte 2 Tage, mit Quelle) und Trainings (letzte 7 Tage).
Der Server speichert pro Kennzahl und Tag genau einen Wert und überschreibt ihn (siehe docs/KURZBEFEHL.md).

Der Aufbau der Health-Aktionen ist aus iOS-Exporten abgelesen (docs/kurzbefehl/README.md). Für "Trainings suchen" ist die
Kennung nicht belegt, deshalb stehen zwei Kandidaten in der Datei. Der falsche erscheint in Kurzbefehle als
"Unbekannte Aktion" und liefert nichts, der richtige füllt "workouts" oder "workouts2". Nach dem ersten Lauf den falschen
aus WORKOUT_CANDIDATES streichen.
"""
import plistlib, sys, uuid

OBJ = "￼"  # Platzhalter für eingefügte Variablen in Textfeldern

def text_with_vars(parts):
    """parts: Liste aus str oder ('var', NAME) oder ('out', UUID, OUTPUTNAME)"""
    s = ""
    att = {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            att[f"{{{len(s)}, 1}}"] = (
                {"Type": "Variable", "VariableName": p[1]}
                if p[0] == "var"
                else {"Type": "ActionOutput", "OutputUUID": p[1], "OutputName": p[2]}
            )
            s += OBJ
    return {"Value": {"string": s, "attachmentsByRange": att}, "WFSerializationType": "WFTextTokenString"}

def plain(s):
    return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}

def action(ident, params, out_uuid=None):
    p = dict(params)
    if out_uuid:
        p["UUID"] = out_uuid
    return {"WFWorkflowActionIdentifier": ident, "WFWorkflowActionParameters": p}

def ref(out_uuid, name):
    return {"Value": {"OutputUUID": out_uuid, "OutputName": name, "Type": "ActionOutput"}, "WFSerializationType": "WFTextTokenAttachment"}

actions = []

def find(sample_type, limit, days=7):
    """Health-Messungen suchen. Aufbau wie von iOS selbst gespeichert (aus einem iCloud-Export abgelesen):
    Typ und Zeitraum sind Filterbedingungen, kein eigenes Feld."""
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.filter.health.quantity", {
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {
                        "Property": "Type",
                        "Operator": 4,
                        "Bounded": True,
                        "Removable": False,
                        "Values": {"Enumeration": {"Value": sample_type, "WFSerializationType": "WFStringSubstitutableState"}},
                    },
                    {
                        "Property": "Start Date",
                        "Operator": 1001,  # ist innerhalb der letzten
                        "Bounded": True,
                        "Removable": False,
                        "Values": {"Number": str(days), "Unit": 16},  # 16 = Tage
                    },
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Latest First",
        "WFContentItemLimitEnabled": True,
        "WFContentItemLimitNumber": limit,
    }, u))
    return u

def detail(find_uuid, prop):
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.properties.health.quantity", {
        "WFContentItemPropertyName": prop,
        "WFInput": ref(find_uuid, "Health-Messungen"),
    }, u))
    return u

def fmt_date(src_uuid, src_name):
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.format.date", {
        "WFDate": ref(src_uuid, src_name),
        "WFDateFormatStyle": "ISO 8601",
        "WFISO8601IncludeTime": True,
    }, u))
    return u

def setvar(name, src_uuid, src_name):
    actions.append(action("is.workflow.actions.setvariable", {
        "WFVariableName": name,
        "WFInput": ref(src_uuid, src_name),
    }))

def point_block(sample_type, value_var, date_var, limit=10):
    f = find(sample_type, limit)
    v = detail(f, "Value"); setvar(value_var, v, "Wert")
    # Kein "Datum formatieren": mit einer Liste von Daten liefert die Aktion nichts. Der Server liest das Datumsformat von Kurzbefehle.
    d = detail(f, "Start Date"); setvar(date_var, d, "Startdatum")

point_block("Weight", "GW", "GD")
point_block("Body Fat Percentage", "KW", "KD")
point_block("Resting Heart Rate", "RW", "RD")
point_block("Heart Rate Variability", "HW", "HD", limit=40)
f = find("Sleep", 80)
v = detail(f, "Value"); setvar("SW", v, "Wert")
d = detail(f, "Start Date"); setvar("SS", d, "Startdatum")
d = detail(f, "End Date"); setvar("SE", d, "Enddatum")

def dict_field(key, value):
    return {"WFItemType": 0, "WFKey": plain(key), "WFValue": value}

def dict_of(items):
    return {"WFItemType": 1, "WFKey": plain(""), "WFValue": {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}}

def sub(key, fields):
    d = dict_of([dict_field(k, text_with_vars([("var", v)])) for k, v in fields])
    d["WFKey"] = plain(key)
    return d

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}
token = args[0] if len(args) > 0 else "rc_HIER_DEIN_TOKEN"
url = args[1] if len(args) > 1 else "https://DEIN-PROJEKT.supabase.co/functions/v1/health-ingest"
stufe2 = "--nur-stufe-1" not in flags
# Trainings erst einschalten, wenn die Kennung der Aktion "Trainings suchen" aus einem iOS-Export belegt ist.
# Eine unbekannte Aktion bricht den ganzen Kurzbefehl ab (geprüft am iPhone, 4.11.2026).
mit_trainings = stufe2 and "--mit-trainings" in flags

metric_items = [
    sub("weight", [("values", "GW"), ("dates", "GD")]),
    sub("body_fat", [("values", "KW"), ("dates", "KD")]),
    sub("resting_hr", [("values", "RW"), ("dates", "RD")]),
    sub("hrv", [("values", "HW"), ("dates", "HD")]),
    sub("sleep", [("values", "SW"), ("starts", "SS"), ("ends", "SE")]),
]

def summed_block(sample_type, prefix, limit=1500, days=2):
    """Schritte, Kalorien, Trainingsminuten: viele kleine Proben, deshalb kurzer Zeitraum. Quelle mitschicken,
    der Server nimmt pro Tag die Quelle mit der größten Summe (iPhone und Watch zählen parallel)."""
    f = find(sample_type, limit, days=days)
    v = detail(f, "Value"); setvar(prefix + "W", v, "Wert")
    d = detail(f, "Start Date"); setvar(prefix + "D", d, "Startdatum")
    q = detail(f, "Source"); setvar(prefix + "Q", q, "Quelle")

# Typnamen wie in der englischen Health-App. Belegt am iPhone: Weight, Body Fat Percentage, Resting Heart Rate,
# Heart Rate Variability, Sleep, Steps, Active Calories, Exercise Minutes. Die übrigen sind abgeleitet: Ist einer
# falsch, zeigt die Suche nach dem Import "Steps" und muss von Hand korrigiert werden.
SUMMED_TYPES = [
    # (Typ, Präfix der Variablen, Schlüssel im Paket)
    ("Steps", "T", "steps"),
    ("Active Calories", "A", "active_kcal"),
    ("Exercise Minutes", "E", "exercise_min"),
    ("Walking + Running Distance", "L", "distance_walk_run"),
    ("Cycling Distance", "C", "distance_cycling"),
]
# Ohne Daten zeigt Kurzbefehle bei jedem Lauf "Keine Messungen gefunden" und wartet auf OK. Deshalb nur auf Wunsch.
if "--mit-schwimmen" in flags:
    SUMMED_TYPES += [("Swimming Distance", "N", "distance_swim"), ("Swimming Strokes", "Z", "swim_strokes")]
POINT_TYPES = [
    # (Typ, Variable Wert, Variable Datum, Schlüssel, Anzahl)
    ("Blood Oxygen", "OW", "OD", "spo2", 40),
    ("Cardio Recovery", "CRW", "CRD", "hr_recovery", 10),
    ("Respiratory Rate", "AFW", "AFD", "resp_rate", 40),
    ("Wrist Temperature", "WTW", "WTD", "wrist_temp", 10),
    ("Cardio Fitness", "VW", "VD", "vo2max", 5),
    ("Body Mass Index", "BMW", "BMD", "bmi", 10),
    ("Lean Body Mass", "MMW", "MMD", "lean_mass", 10),
]
if "--mit-blutzucker" in flags:  # erst mit Sensor sinnvoll
    POINT_TYPES.append(("Blood Glucose", "BZW", "BZD", "glucose", 300))

if stufe2:
    for typ, prefix, key in SUMMED_TYPES:
        summed_block(typ, prefix)
        metric_items.append(sub(key, [("values", prefix + "W"), ("dates", prefix + "D"), ("sources", prefix + "Q")]))
    for typ, vw, vd, key, limit in POINT_TYPES:
        point_block(typ, vw, vd, limit=limit)
        metric_items.append(sub(key, [("values", vw), ("dates", vd)]))

metrics = dict_of(metric_items)
metrics["WFKey"] = plain("metrics")
body_items = [metrics]

# Trainings: Kennung der Such-Aktion nicht belegt, zwei Kandidaten (siehe Kopf der Datei).
# Eigenschaften laut ActionKit (WFHKWorkoutContentItem): Activity Type, Start Date, End Date, Calories, Distance, Source.
WORKOUT_CANDIDATES = [
    ("workouts", "is.workflow.actions.filter.health.workout", "is.workflow.actions.properties.health.workout", "W"),
    ("workouts2", "is.workflow.actions.filter.workouts", "is.workflow.actions.properties.workouts", "X"),
]

def workout_block(find_ident, props_ident, prefix, limit=20, days=7):
    u = str(uuid.uuid4()).upper()
    actions.append(action(find_ident, {
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {"Property": "Start Date", "Operator": 1001, "Bounded": True, "Removable": True, "Values": {"Number": str(days), "Unit": 16}},
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Latest First",
        "WFContentItemLimitEnabled": True,
        "WFContentItemLimitNumber": limit,
    }, u))
    def prop(name, var, out_name):
        pu = str(uuid.uuid4()).upper()
        actions.append(action(props_ident, {"WFContentItemPropertyName": name, "WFInput": ref(u, "Workouts")}, pu))
        setvar(prefix + var, pu, out_name)
    prop("Activity Type", "T", "Aktivitätstyp")
    prop("Start Date", "S", "Startdatum")
    prop("End Date", "E", "Enddatum")
    prop("Calories", "K", "Kalorien")
    prop("Distance", "M", "Distanz")
    prop("Source", "Q", "Quelle")

if mit_trainings:
    for key, find_ident, props_ident, prefix in WORKOUT_CANDIDATES:
        workout_block(find_ident, props_ident, prefix)
        block = sub(key, [("types", prefix + "T"), ("starts", prefix + "S"), ("ends", prefix + "E"), ("kcal", prefix + "K"), ("distances", prefix + "M"), ("sources", prefix + "Q")])
        body_items.append(block)

dl = str(uuid.uuid4()).upper()
actions.append(action("is.workflow.actions.downloadurl", {
    "WFURL": url,
    "WFHTTPMethod": "POST",
    "WFHTTPBodyType": "JSON",
    "WFHTTPHeaders": {"Value": {"WFDictionaryFieldValueItems": [dict_field("x-recomp-token", plain(token))]}, "WFSerializationType": "WFDictionaryFieldValue"},
    "WFJSONValues": {"Value": {"WFDictionaryFieldValueItems": body_items}, "WFSerializationType": "WFDictionaryFieldValue"},
    "ShowHeaders": True,
}, dl))
gv = str(uuid.uuid4()).upper()
actions.append(action("is.workflow.actions.getvalueforkey", {
    "WFDictionaryKey": "summary",
    "WFGetDictionaryValueType": "Value",
    "WFInput": ref(dl, "Contents of URL"),
}, gv))
actions.append(action("is.workflow.actions.notification", {
    "WFNotificationActionBody": text_with_vars([("out", gv, "Dictionary Value")]),
    "WFNotificationActionSound": False,
}))

wf = {
    "WFWorkflowClientVersion": "2607.0.3",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 2071128575, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["NCWidget", "WatchKit"],
    "WFWorkflowInputContentItemClasses": ["WFAppContentItem", "WFArticleContentItem", "WFContactContentItem", "WFDateContentItem", "WFEmailAddressContentItem", "WFGenericFileContentItem", "WFImageContentItem", "WFLocationContentItem", "WFDCMapsLinkContentItem", "WFAVAssetContentItem", "WFPDFContentItem", "WFPhoneNumberContentItem", "WFRichTextContentItem", "WFSafariWebPageContentItem", "WFStringContentItem", "WFURLContentItem"],
    "WFWorkflowImportQuestions": [],
    "WFWorkflowHasShortcutInputVariables": False,
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowActions": actions,
}
out = "Recomp Health.shortcut"
with open(out, "wb") as f:
    plistlib.dump(wf, f, fmt=plistlib.FMT_BINARY)
print(f"{out}: {len(actions)} Aktionen")
