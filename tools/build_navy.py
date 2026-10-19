#!/usr/bin/env python3
"""Build the Definitive Navy mod for Age of History II: Definitive Edition.

python3 tools/build_navy.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "DefinitiveNavy"

NAVY = (8, 28, 58)
GOLD = (212, 175, 55)
WHITE = (255, 255, 255)
RED = (158, 32, 36)
SEA = (28, 92, 140)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def block(kind: str, conds: list[str]) -> list[str]:
    lines = [f"trigger_{kind}"]
    for cond in conds:
        lines.append(f"next_{kind}")
        lines.append(cond)
    lines.append(f"trigger_{kind}_end")
    return lines


def option(name: str, ai: int, effects: list[str]) -> list[str]:
    return ["option_btn", f"name={name}", f"ai={ai}", *effects, "option_end"]


def render_event(event_id: str, image: str, mission_image: int, once: bool, parts: list[list[str]]) -> str:
    lines = [
        f"id={event_id}",
        f"title={event_id}.t",
        f"desc={event_id}.d",
        f"mission_desc={event_id}.m",
        f"image={image}",
        "show_in_missions=true",
        f"mission_image={mission_image}",
        "popUp=true",
        f"only_once={'true' if once else 'false'}",
    ]
    for part in parts:
        lines.extend(part)
    return "\n".join(lines) + "\n"


# id, image, mission slot, once, trigger blocks, options
# Costs are negative gold. The year gates are the naval tech tree.
EVENTS: list[tuple] = [
    (
        "nav_port", "port.png", 0, True,
        [block("and", ["civ_gold_over=90", "civ_provinces_over=1"])],
        [
            option("nav_port.o1", 70, ["gold=-90", "legacy=15", "bonus_duration=30", "bonus_monthly_income=4"]),
            option("nav_port.o2", 30, ["gold=-40", "legacy=5"]),
        ],
    ),
    (
        "nav_yard", "yard.png", 0, True,
        [block("and", ["has_variable=nav_port", "civ_gold_over=140"])],
        [
            option("nav_yard.o1", 75, ["gold=-140", "legacy=20"]),
            option("nav_yard.o2", 25, ["gold=-70", "legacy=8"]),
        ],
    ),
    (
        "nav_transport", "sail.png", 0, True,
        [block("and", ["has_variable=nav_port", "year_over=500", "civ_gold_over=60"])],
        [
            option("nav_transport.o1", 80, ["gold=-60", "province_manpower=0.8"]),
            option("nav_transport.o2", 20, ["gold=-30"]),
        ],
    ),
    (
        "nav_galley", "sail.png", 2, True,
        [block("and", ["has_variable=nav_port", "year_over=400", "year_below=1550", "civ_gold_over=50"])],
        [
            option("nav_galley.o1", 70, ["gold=-50", "bonus_duration=25", "bonus_max_morale=4"]),
            option("nav_galley.o2", 30, ["gold=-25", "bonus_duration=12", "bonus_max_morale=2"]),
        ],
    ),
    (
        "nav_inland", "sail.png", 2, True,
        [block("and", ["has_variable=nav_galley", "year_below=1500"])],
        [
            option("nav_inland.o1", 65, ["bonus_duration=20", "bonus_max_morale=3", "bonus_army_morale_recovery=6"]),
            option("nav_inland.o2", 35, ["legacy=10"]),
        ],
    ),
    (
        "nav_frigate", "sail.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1580", "year_below=1870", "civ_gold_over=80"])],
        [
            option("nav_frigate.o1", 75, ["gold=-80", "bonus_duration=20", "bonus_max_morale=4", "bonus_army_morale_recovery=5"]),
            option("nav_frigate.o2", 25, ["gold=-45", "bonus_duration=12", "bonus_max_morale=2"]),
        ],
    ),
    (
        "nav_sol", "line.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1650", "year_below=1870", "civ_gold_over=160"])],
        [
            option("nav_sol.o1", 70, ["gold=-160", "bonus_duration=20", "bonus_max_morale=8"]),
            option("nav_sol.o2", 30, ["gold=-90", "bonus_duration=12", "bonus_max_morale=5"]),
        ],
    ),
    (
        "nav_ironclad", "steam.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1855", "year_below=1910", "civ_gold_over=200"])],
        [
            option("nav_ironclad.o1", 70, ["gold=-200", "bonus_duration=20", "bonus_max_morale=9"]),
            option("nav_ironclad.o2", 30, ["gold=-110", "bonus_duration=12", "bonus_max_morale=5"]),
        ],
    ),
    (
        "nav_cruiser", "steam.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1880", "civ_gold_over=170"])],
        [
            option("nav_cruiser.o1", 70, ["gold=-170", "bonus_duration=18", "bonus_max_morale=6", "bonus_army_morale_recovery=12"]),
            option("nav_cruiser.o2", 30, ["gold=-90", "bonus_duration=10", "bonus_army_morale_recovery=6"]),
        ],
    ),
    (
        "nav_battleship", "modern.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1890", "civ_gold_over=400"]),
         block("or", ["has_variable=nav_ironclad", "has_variable=nav_cruiser", "has_variable=nav_sol"])],
        [
            option("nav_battleship.o1", 60, ["gold=-340", "bonus_duration=18", "bonus_max_morale=12"]),
            option("nav_battleship.o2", 40, ["gold=-180", "bonus_duration=10", "bonus_max_morale=7"]),
        ],
    ),
    (
        "nav_carrier", "modern.png", 0, True,
        [block("and", ["has_variable=nav_yard", "year_over=1917", "civ_gold_over=300"]),
         block("or", ["has_variable=nav_battleship", "has_variable=nav_cruiser"])],
        [
            option("nav_carrier.o1", 65, ["gold=-300", "bonus_duration=20", "bonus_max_morale=5", "bonus_monthly_income=8"]),
            option("nav_carrier.o2", 35, ["gold=-160", "bonus_duration=12", "bonus_monthly_income=4"]),
        ],
    ),
    (
        "nav_sub", "raid.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1900", "civ_gold_over=150"])],
        [
            option("nav_sub.o1", 65, ["gold=-150", "legacy=10"]),
            option("nav_sub.o2", 35, ["gold=-80"]),
        ],
    ),
    (
        "nav_fleet_sail", "line.png", 2, True,
        [block("or", ["has_variable=nav_frigate", "has_variable=nav_sol", "has_variable=nav_galley"])],
        [
            option("nav_fleet_sail.o1", 80, ["legacy=25", "bonus_duration=25", "bonus_max_morale=6"]),
            option("nav_fleet_sail.o2", 20, ["legacy=10"]),
        ],
    ),
    (
        "nav_fleet_steam", "steam.png", 2, True,
        [block("or", ["has_variable=nav_ironclad", "has_variable=nav_cruiser"])],
        [
            option("nav_fleet_steam.o1", 80, ["legacy=30", "bonus_duration=22", "bonus_max_morale=8", "bonus_army_morale_recovery=6"]),
            option("nav_fleet_steam.o2", 20, ["legacy=12"]),
        ],
    ),
    (
        "nav_fleet_modern", "modern.png", 2, True,
        [block("and", ["has_variable=nav_battleship", "year_over=1890"])],
        [
            option("nav_fleet_modern.o1", 75, ["legacy=40", "bonus_duration=20", "bonus_max_morale=10"]),
            option("nav_fleet_modern.o2", 25, ["legacy=15", "gold=-40"]),
        ],
    ),
    (
        "nav_load", "sail.png", 0, True,
        [block("and", ["has_variable=nav_transport", "civ_provinces_over=2"])],
        [
            option("nav_load.o1", 80, ["province_manpower=1.5", "legacy=10"]),
            option("nav_load.o2", 20, ["province_manpower=0.6"]),
        ],
    ),
    (
        "nav_cross", "storm.png", 2, True,
        [block("and", ["has_variable=nav_load"]),
         block("or", ["has_variable=nav_galley", "has_variable=nav_frigate", "has_variable=nav_sol", "has_variable=nav_ironclad", "has_variable=nav_cruiser", "has_variable=nav_battleship"])],
        [
            option("nav_cross.o1", 70, ["bonus_duration=8", "bonus_max_morale=4", "legacy=15"]),
            option("nav_cross.o2", 30, ["gold=-30", "legacy=5"]),
        ],
    ),
    (
        "nav_cross_bare", "storm.png", 2, False,
        [block("and", [
            "has_variable=nav_transport",
            "has_variable_not=nav_galley",
            "has_variable_not=nav_frigate",
            "has_variable_not=nav_sol",
            "has_variable_not=nav_ironclad",
            "has_variable_not=nav_cruiser",
            "has_variable_not=nav_battleship",
            "random_chance=35",
        ])],
        [
            option("nav_cross_bare.o1", 40, ["gold=-70", "province_manpower=0.4"]),
            option("nav_cross_bare.o2", 60, ["legacy=-5"]),
        ],
    ),
    (
        "nav_battle", "line.png", 2, True,
        [block("and", ["has_variable=nav_cross"])],
        [
            option("nav_battle.o1", 65, ["bonus_duration=10", "bonus_max_morale=7", "province_manpower=1"]),
            option("nav_battle.o2", 35, ["gold=-50", "legacy=20"]),
        ],
    ),
    (
        "nav_land", "port.png", 2, True,
        [block("and", ["has_variable=nav_battle", "civ_provinces_over=1"])],
        [
            option("nav_land.o1", 75, ["province_manpower=2", "legacy=20", "bonus_duration=8", "bonus_max_morale=4"]),
            option("nav_land.o2", 25, ["province_manpower=1", "gold=40"]),
        ],
    ),
    (
        "nav_beach", "port.png", 0, True,
        [block("and", ["has_variable=nav_land"])],
        [
            option("nav_beach.o1", 70, ["legacy=25", "bonus_duration=15", "bonus_monthly_income=6", "province_economy_capital=8"]),
            option("nav_beach.o2", 30, ["province_manpower=1.2", "bonus_duration=8", "bonus_max_morale=3"]),
        ],
    ),
    (
        "nav_control", "modern.png", 0, False,
        [block("and", ["year_over=1500", "random_chance=18"]),
         block("or", ["has_variable=nav_fleet_sail", "has_variable=nav_fleet_steam", "has_variable=nav_fleet_modern", "has_variable=nav_sol", "has_variable=nav_battleship"])],
        [
            option("nav_control.o1", 70, ["bonus_duration=12", "bonus_monthly_income=14", "bonus_army_morale_recovery=8", "legacy=10"]),
            option("nav_control.o2", 30, ["bonus_duration=12", "bonus_max_morale=5"]),
        ],
    ),
    (
        "nav_trade", "raid.png", 0, False,
        [block("and", [
            "year_over=1500",
            "civ_provinces_over=8",
            "has_variable_not=nav_fleet_sail",
            "has_variable_not=nav_fleet_steam",
            "has_variable_not=nav_fleet_modern",
            "has_variable_not=nav_frigate",
            "has_variable_not=nav_cruiser",
            "has_variable_not=nav_battleship",
            "random_chance=22",
        ])],
        [
            option("nav_trade.o1", 55, ["gold=-60"]),
            option("nav_trade.o2", 45, ["legacy=-8", "gold=-20"]),
        ],
    ),
    (
        "nav_blockade", "storm.png", 2, False,
        [block("and", ["year_over=1600", "random_chance=16"]),
         block("or", ["has_variable=nav_frigate", "has_variable=nav_cruiser", "has_variable=nav_sub", "has_variable=nav_sol"])],
        [
            option("nav_blockade.o1", 60, ["gold=70", "legacy=15"]),
            option("nav_blockade.o2", 40, ["bonus_duration=10", "bonus_max_morale=4"]),
        ],
    ),
    (
        "nav_raid", "raid.png", 2, False,
        [block("and", ["has_variable=nav_sub", "year_over=1900", "random_chance=28"])],
        [
            option("nav_raid.o1", 70, ["gold=90", "legacy=8"]),
            option("nav_raid.o2", 30, ["legacy=15"]),
        ],
    ),
    (
        "nav_upkeep", "yard.png", 0, False,
        [block("and", ["civ_gold_over=80", "random_chance=20"]),
         block("or", ["has_variable=nav_frigate", "has_variable=nav_sol", "has_variable=nav_ironclad", "has_variable=nav_cruiser", "has_variable=nav_battleship", "has_variable=nav_carrier"])],
        [
            option("nav_upkeep.o1", 45, ["gold=-50"]),
            option("nav_upkeep.o2", 55, ["gold=-120", "bonus_duration=10", "bonus_max_morale=3"]),
        ],
    ),
    (
        "nav_upkeep_heavy", "modern.png", 0, False,
        [block("and", ["has_variable=nav_battleship", "civ_gold_below=500", "civ_gold_over=40", "random_chance=30"])],
        [
            option("nav_upkeep_heavy.o1", 35, ["gold=-200"]),
            option("nav_upkeep_heavy.o2", 65, ["gold=-40", "legacy=-10"]),
        ],
    ),
    (
        "nav_pirates", "raid.png", 2, False,
        [block("and", ["has_variable=nav_port", "year_below=1850", "random_chance=18"])],
        [
            option("nav_pirates.o1", 50, ["gold=-40", "legacy=5"]),
            option("nav_pirates.o2", 50, ["province_manpower=0.8", "bonus_duration=8", "bonus_max_morale=3"]),
        ],
    ),
    (
        "nav_mutiny", "storm.png", 2, False,
        [block("and", ["random_chance=12"]),
         block("or", ["has_variable=nav_galley", "has_variable=nav_sol", "has_variable=nav_battleship", "has_variable=nav_fleet_sail"])],
        [
            option("nav_mutiny.o1", 40, ["gold=-50", "legacy=10"]),
            option("nav_mutiny.o2", 60, ["legacy=-12"]),
        ],
    ),
    (
        "nav_accident", "yard.png", 0, False,
        [block("and", ["has_variable=nav_yard", "random_chance=14"])],
        [
            option("nav_accident.o1", 60, ["gold=-80"]),
            option("nav_accident.o2", 40, ["gold=-30", "legacy=-6"]),
        ],
    ),
    (
        "nav_admiral", "line.png", 0, True,
        [block("or", ["has_variable=nav_fleet_sail", "has_variable=nav_fleet_steam", "has_variable=nav_fleet_modern", "has_variable=nav_sol", "has_variable=nav_battleship"])],
        [
            option("nav_admiral.o1", 70, ["legacy=35", "bonus_duration=20", "bonus_max_morale=6"]),
            option("nav_admiral.o2", 30, ["legacy=15", "bonus_duration=20", "bonus_monthly_income=5"]),
        ],
    ),
    (
        "nav_arms", "modern.png", 0, True,
        [block("and", ["year_over=1890", "civ_gold_over=250", "has_variable=nav_yard"])],
        [
            option("nav_arms.o1", 55, ["gold=-220", "legacy=20", "bonus_duration=15", "bonus_max_morale=6"]),
            option("nav_arms.o2", 45, ["legacy=25", "gold=30"]),
        ],
    ),
    (
        "nav_strike", "port.png", 0, False,
        [block("and", ["has_variable=nav_port", "year_over=1850", "random_chance=12"])],
        [
            option("nav_strike.o1", 50, ["gold=-40", "legacy=8"]),
            option("nav_strike.o2", 50, ["legacy=-8"]),
        ],
    ),
    (
        "nav_treaty", "treaty.png", 0, True,
        [block("and", ["year_over=1920", "has_variable=nav_battleship"])],
        [
            option("nav_treaty.o1", 40, ["legacy=30", "gold=80"]),
            option("nav_treaty.o2", 60, ["gold=-100", "bonus_duration=15", "bonus_max_morale=5"]),
        ],
    ),
    (
        "nav_conference", "treaty.png", 0, True,
        [block("and", ["year_over=1905"]),
         block("or", ["has_variable=nav_cruiser", "has_variable=nav_battleship", "has_variable=nav_carrier"])],
        [
            option("nav_conference.o1", 50, ["legacy=20", "gold=40"]),
            option("nav_conference.o2", 50, ["legacy=10", "bonus_duration=12", "bonus_monthly_income=6"]),
        ],
    ),
    (
        "nav_doctrine_battle", "line.png", 2, True,
        [block("and", ["has_variable=nav_yard", "year_over=1650"]),
         block("or", ["has_variable=nav_sol", "has_variable=nav_battleship", "has_variable=nav_ironclad"])],
        [
            option("nav_doctrine_battle.o1", 70, ["bonus_duration=30", "bonus_max_morale=8", "legacy=15"]),
            option("nav_doctrine_battle.o2", 30, ["legacy=8"]),
        ],
    ),
    (
        "nav_doctrine_raid", "raid.png", 2, True,
        [block("and", ["year_over=1880"]),
         block("or", ["has_variable=nav_cruiser", "has_variable=nav_sub", "has_variable=nav_frigate"])],
        [
            option("nav_doctrine_raid.o1", 70, ["bonus_duration=25", "bonus_army_morale_recovery=10", "legacy=12"]),
            option("nav_doctrine_raid.o2", 30, ["gold=50"]),
        ],
    ),
    (
        "nav_doctrine_land", "sail.png", 0, True,
        [block("and", ["has_variable=nav_transport"]),
         block("or", ["has_variable=nav_carrier", "has_variable=nav_frigate", "has_variable=nav_galley"])],
        [
            option("nav_doctrine_land.o1", 70, ["province_manpower=1.4", "bonus_duration=20", "bonus_monthly_income=4"]),
            option("nav_doctrine_land.o2", 30, ["legacy=10"]),
        ],
    ),
]


STRINGS: list[tuple[str, str]] = [
    ("L0", "A ship that cannot be paid will not stay a ship."),
    ("L1", "Transports move armies. Warships move the argument."),
    ("L2", "Galleys own the inland sea. They do not own the ocean."),
    ("L3", "A frigate is an escort you can afford. A battleship is a choice."),
    ("L4", "Sea control is a trade route that still arrives."),
    ("L5", "Islands are safe until someone brings transports."),
    ("L6", "One fleet on the map is enough. Fifty ships is a ledger."),
    ("L7", "The beachhead is the invasion. The landing is only the door."),
    ("nav_port.t", "A Working Port"),
    ("nav_port.d", "Wharves, a customs shed, and water deep enough for a loaded hull. Without this, a navy is a story told inland."),
    ("nav_port.m", "Open a port so ships can base and armies can embark."),
    ("nav_port.o1", "Build a proper port"),
    ("nav_port.o2", "Make do with a jetty"),
    ("nav_yard.t", "The Shipyard"),
    ("nav_yard.d", "A port keeps ships. A yard builds them. The slipways decide which century your navy is allowed to enter."),
    ("nav_yard.m", "Raise a shipyard on a working port."),
    ("nav_yard.o1", "Cut the slipways"),
    ("nav_yard.o2", "Rent a single dock"),
    ("nav_transport.t", "Transports"),
    ("nav_transport.d", "Hulls with space for men, horses, and the food they will complain about. An army does not cross ocean by itself."),
    ("nav_transport.m", "Build transports and give the army a way across water."),
    ("nav_transport.o1", "Build a transport flotilla"),
    ("nav_transport.o2", "Hire a few merchant hulls"),
    ("nav_galley.t", "Galleys"),
    ("nav_galley.d", "Oars, a ram, and a crew that can see the coast they fight along. This is the early navy: deadly in a strait, useless in a storm far from land."),
    ("nav_galley.m", "Commission galleys for coastal and inland seas."),
    ("nav_galley.o1", "Build a galley squadron"),
    ("nav_galley.o2", "Keep a handful of patrol oars"),
    ("nav_inland.t", "Season on the Inland Sea"),
    ("nav_inland.d", "The galleys keep the inner water: the strait, the gulf, the sea a rider can still smell. Deep ocean is not their work."),
    ("nav_inland.m", "Use the galleys where oars still matter."),
    ("nav_inland.o1", "Control the inner sea"),
    ("nav_inland.o2", "Hold the harbors only"),
    ("nav_frigate.t", "Frigates"),
    ("nav_frigate.d", "Fast sailing cruisers of their day. They escort transports, hunt raiders, and cost less than a line of battle. A poor navy can still be a present navy if it buys these."),
    ("nav_frigate.m", "Commission frigates as escorts."),
    ("nav_frigate.o1", "Build a frigate squadron"),
    ("nav_frigate.o2", "Buy two hulls and a promise"),
    ("nav_sol.t", "Ships of the Line"),
    ("nav_sol.d", "Gun decks, tall sides, and a bill that makes treasurers sit down. This is heavy sailing warfare, not a patrol."),
    ("nav_sol.m", "Lay down ships of the line."),
    ("nav_sol.o1", "Build a battle line"),
    ("nav_sol.o2", "Build a short line"),
    ("nav_ironclad.t", "Ironclads"),
    ("nav_ironclad.d", "Steam, armor, and a gun that makes wooden sides obsolete. The transitional capital ship: ugly, expensive, and suddenly the only argument in the roadstead."),
    ("nav_ironclad.m", "Build ironclads."),
    ("nav_ironclad.o1", "Armor the capital ships"),
    ("nav_ironclad.o2", "Convert one hull and wait"),
    ("nav_cruiser.t", "Cruisers"),
    ("nav_cruiser.d", "Fast enough to choose the fight and leave it. Cruisers are how a fleet stays in being without dragging every ton of armor across the map."),
    ("nav_cruiser.m", "Commission cruisers for fast fleet work."),
    ("nav_cruiser.o1", "Build a cruiser squadron"),
    ("nav_cruiser.o2", "Lay down a pair of scouts"),
    ("nav_battleship.t", "Battleships"),
    ("nav_battleship.d", "The heavy fist. A few of these can decide a sea. Fifty of them can decide that your country no longer has a treasury. Landlocked states should not pretend otherwise."),
    ("nav_battleship.m", "Build battleships, and be ready to pay for them."),
    ("nav_battleship.o1", "Build a battle squadron"),
    ("nav_battleship.o2", "Build one flagship and stop"),
    ("nav_carrier.t", "Carriers"),
    ("nav_carrier.d", "The late fleet's support ship. It does not win by standing in the line. It lets the fleet see farther and strike a coast before the transports arrive."),
    ("nav_carrier.m", "Commission a carrier."),
    ("nav_carrier.o1", "Build a fleet carrier"),
    ("nav_carrier.o2", "Convert a hull for aircraft"),
    ("nav_sub.t", "Submarines"),
    ("nav_sub.d", "They are bad at parades and good at making merchants late. A submarine squadron is for commerce and surprise, not for a battle line."),
    ("nav_sub.m", "Build submarines."),
    ("nav_sub.o1", "Build a submarine flotilla"),
    ("nav_sub.o2", "Trial a few boats"),
    ("nav_fleet_sail.t", "The Sailing Fleet"),
    ("nav_fleet_sail.d", "Galleys, frigates, or ships of the line are gathered under one flag. On the map they are one force, not a crowd of hulls."),
    ("nav_fleet_sail.m", "Form one sailing fleet."),
    ("nav_fleet_sail.o1", "Hoist the fleet flag"),
    ("nav_fleet_sail.o2", "Keep the squadrons separate"),
    ("nav_fleet_steam.t", "The Steam Fleet"),
    ("nav_fleet_steam.d", "Ironclads and cruisers take one station. Coal, not wind, now decides who arrives."),
    ("nav_fleet_steam.m", "Form the steam fleet."),
    ("nav_fleet_steam.o1", "Concentrate the steam ships"),
    ("nav_fleet_steam.o2", "Leave them on separate stations"),
    ("nav_fleet_modern.t", "The Battle Fleet"),
    ("nav_fleet_modern.d", "Battleships, with whatever cruisers, carriers, and boats you have paid for, become one fleet. This is the counter that matters. The rest is a list in a book."),
    ("nav_fleet_modern.m", "Form the modern battle fleet."),
    ("nav_fleet_modern.o1", "Concentrate the battle fleet"),
    ("nav_fleet_modern.o2", "Keep a reserve and a main force"),
    ("nav_load.t", "The Army Embarks"),
    ("nav_load.d", "Regiments file onto the transports. Horses complain. The war, for a week, is a problem of gangways."),
    ("nav_load.m", "Load an army onto the transports."),
    ("nav_load.o1", "Load a full expedition"),
    ("nav_load.o2", "Load a raid"),
    ("nav_cross.t", "The Crossing"),
    ("nav_cross.d", "The transports leave with an escort. Enemy ships, if they have any, have to be fought through before anyone sees a beach."),
    ("nav_cross.m", "Cross open water under escort."),
    ("nav_cross.o1", "Cross in fighting order"),
    ("nav_cross.o2", "Cross wide and quiet"),
    ("nav_cross_bare.t", "Transports Without an Escort"),
    ("nav_cross_bare.d", "The army is at sea in hulls that cannot fight. Weather, pirates, or someone else's frigate can end the invasion before it starts."),
    ("nav_cross_bare.m", "You have transports and no warship."),
    ("nav_cross_bare.o1", "Pay for a hired escort"),
    ("nav_cross_bare.o2", "Risk the crossing anyway"),
    ("nav_battle.t", "Fight Through the Sea"),
    ("nav_battle.d", "Their ships are between you and the coast you want. The landing does not happen until this water is yours, or until they run out of hulls."),
    ("nav_battle.m", "Beat the defending navy."),
    ("nav_battle.o1", "Fight it out"),
    ("nav_battle.o2", "Buy a passage with prizes and bribes"),
    ("nav_land.t", "The Landing"),
    ("nav_land.d", "Boats on a beach, a first line in the dunes, and a navy that still has to stay offshore. This is not a walk onto the province."),
    ("nav_land.m", "Land the army on a hostile coast."),
    ("nav_land.o1", "Storm the beach"),
    ("nav_land.o2", "Land up the coast and march"),
    ("nav_beach.t", "The Beachhead"),
    ("nav_beach.d", "Supplies come back over the water. The army is ashore, fed, and no longer a passenger. From here it is a land war again."),
    ("nav_beach.m", "Hold the beachhead and push inland."),
    ("nav_beach.o1", "Fortify and supply it"),
    ("nav_beach.o2", "Push inland at once"),
    ("nav_control.t", "Sea Control"),
    ("nav_control.d", "Your fleet owns the water it can actually reach. Troopships are safer, overseas coin arrives, and someone else's invasion has to think twice."),
    ("nav_control.m", "Hold sea control with a formed fleet."),
    ("nav_control.o1", "Protect the trade"),
    ("nav_control.o2", "Keep the fleet concentrated to fight"),
    ("nav_trade.t", "The Trade Does Not Arrive"),
    ("nav_trade.d", "Overseas income depends on water you do not control. No frigate, no cruiser, no battle fleet. The Atlantic, or whatever sea you needed, belongs to someone else this season."),
    ("nav_trade.m", "Your trade is open because you have no navy on it."),
    ("nav_trade.o1", "Pay the losses and keep buying"),
    ("nav_trade.o2", "Let the merchants eat the loss"),
    ("nav_blockade.t", "Blockade"),
    ("nav_blockade.d", "Your ships sit off a coast and make the harbor a rumor. Blockade is how a navy spends a war when it is not in a battle."),
    ("nav_blockade.m", "Close an enemy coast."),
    ("nav_blockade.o1", "Take prizes"),
    ("nav_blockade.o2", "Hold the line and wait"),
    ("nav_raid.t", "Boats on the Trade Route"),
    ("nav_raid.d", "The submarines are not here to win a review. They are here to make a convoy late, then missing."),
    ("nav_raid.m", "Use submarines against commerce."),
    ("nav_raid.o1", "Hunt the convoys"),
    ("nav_raid.o2", "Hold them for a fleet ambush"),
    ("nav_upkeep.t", "The Navy Sends Its Bill"),
    ("nav_upkeep.d", "Cordage, coal, powder, pay. A squadron you cannot feed is a squadron that rots at the pier. Frigates are a bill. Capital ships are a bigger one."),
    ("nav_upkeep.m", "Pay the fleet, or let it sit."),
    ("nav_upkeep.o1", "Pay ordinary upkeep"),
    ("nav_upkeep.o2", "Pay to keep them worked up"),
    ("nav_upkeep_heavy.t", "The Battleships Are Too Many"),
    ("nav_upkeep_heavy.d", "The capital ships cost more than the country currently enjoys paying. A landlocked treasury and a battle fleet do not belong in the same sentence."),
    ("nav_upkeep_heavy.m", "The battle fleet is eating the budget."),
    ("nav_upkeep_heavy.o1", "Pay for the battle fleet"),
    ("nav_upkeep_heavy.o2", "Lay the big ships up"),
    ("nav_pirates.t", "Pirates on the Sea Lanes"),
    ("nav_pirates.d", "Someone with a fast hull and no flag you recognize is charging a toll. Ports attract this. Warships exist to stop it."),
    ("nav_pirates.m", "Deal with pirates."),
    ("nav_pirates.o1", "Pay a convoy tax"),
    ("nav_pirates.o2", "Send ships after them"),
    ("nav_mutiny.t", "Mutiny"),
    ("nav_mutiny.d", "Pay is late, the water is foul, and an officer has been unwise. A fleet is a town that can leave."),
    ("nav_mutiny.m", "Face a mutiny in the fleet."),
    ("nav_mutiny.o1", "Pay the crews and hang no one today"),
    ("nav_mutiny.o2", "Break it and accept the damage"),
    ("nav_accident.t", "Accident on the Slipway"),
    ("nav_accident.d", "A keel cracks, a boiler bursts, or a fire takes the ropewalk. Yards are where a navy spends money even when no one is shooting."),
    ("nav_accident.m", "The shipyard has had an accident."),
    ("nav_accident.o1", "Rebuild the slip"),
    ("nav_accident.o2", "Patch it and lose the month"),
    ("nav_admiral.t", "An Admiral Worth the Flag"),
    ("nav_admiral.d", "One officer the fleet will actually follow. The ships do not get heavier. They get used with less waste."),
    ("nav_admiral.m", "A notable admiral takes command."),
    ("nav_admiral.o1", "Give them the battle fleet"),
    ("nav_admiral.o2", "Give them the trade stations"),
    ("nav_arms.t", "A Naval Arms Race"),
    ("nav_arms.d", "Someone else's yard is busy, so yours is asked to be busier. You can spend, or you can let them have the sea and keep the coin."),
    ("nav_arms.m", "Answer a naval arms race."),
    ("nav_arms.o1", "Build to match them"),
    ("nav_arms.o2", "Stay out of it"),
    ("nav_strike.t", "Strike in the Port"),
    ("nav_strike.d", "Dockers stop the coal, the crates, and the patience. A fleet that cannot load cannot leave."),
    ("nav_strike.m", "The port is on strike."),
    ("nav_strike.o1", "Pay them"),
    ("nav_strike.o2", "Wait them out"),
    ("nav_treaty.t", "A Naval Treaty"),
    ("nav_treaty.d", "The powers propose a limit on capital ships. Sign, and the bill shrinks. Refuse, and you keep the tonnage and the cost."),
    ("nav_treaty.m", "Answer a limit on battleships."),
    ("nav_treaty.o1", "Sign the limit"),
    ("nav_treaty.o2", "Keep building"),
    ("nav_conference.t", "The Naval Conference"),
    ("nav_conference.d", "Admirals and ministers sit in a room with a map of everyone else's bases. They will leave with a communique and a grudge."),
    ("nav_conference.m", "Sit at a naval conference."),
    ("nav_conference.o1", "Trade limits for recognition"),
    ("nav_conference.o2", "Trade visits for coaling rights"),
    ("nav_doctrine_battle.t", "Doctrine: The Line"),
    ("nav_doctrine_battle.d", "Fight in heavy ships and accept the bill. Galleys, frigates, and submarines are not the point. The point is a force that can stand in a battle."),
    ("nav_doctrine_battle.m", "Adopt a battle-line doctrine."),
    ("nav_doctrine_battle.o1", "Make the heavy fleet the doctrine"),
    ("nav_doctrine_battle.o2", "Keep it as one option"),
    ("nav_doctrine_raid.t", "Doctrine: The Raid"),
    ("nav_doctrine_raid.d", "Cruisers and submarines. You will not own the sea in a review. You will make the other navy's trade expensive."),
    ("nav_doctrine_raid.m", "Adopt a raiding doctrine."),
    ("nav_doctrine_raid.o1", "Hunt commerce"),
    ("nav_doctrine_raid.o2", "Keep the raiders as a sideshow"),
    ("nav_doctrine_land.t", "Doctrine: The Landing"),
    ("nav_doctrine_land.d", "Transports first, escorts second, the beach third. This is the navy of an island power or of anyone who intends to visit one."),
    ("nav_doctrine_land.m", "Adopt an invasion doctrine."),
    ("nav_doctrine_land.o1", "Build the navy around landings"),
    ("nav_doctrine_land.o2", "Keep a small expeditionary habit"),
]


def write_data() -> None:
    write(
        MOD / "mod.txt",
        """{
	Name: "Definitive Navy",
	Description: "Ports, shipyards, nine ship types, fleets, invasions, sea control, and the bills that come with them.",
	Tags: [ "Mod", "Units", "Events" ],
	ChangeNote: "Navy 1.0 through a playable slice of 3.0, as events on the existing game.",
}
""",
    )
    write(
        MOD / "INSTALL.txt",
        """Definitive Navy
Age of History II: Definitive Edition

Copy this folder to mods/DefinitiveNavy so the game sees mods/DefinitiveNavy/mod.txt.
It can sit next to Crowns of the Atlantic. Enable it in the mod list.

This is a navy on the game's existing event and economy systems. The base game
still lets a land army walk across sea provinces. These missions are the naval
rules you play instead: pay for a port, pay for hulls, escort the transports,
then land.

Order of play
1. A Working Port. Needs gold. A jetty is cheaper and unlocks less pride, but the same next step.
2. The Shipyard. Needs the port. Military hulls wait on this.
3. Commission ships. Each type is one squadron, not one sprite.
   Galley: years 401-1549, port only.
   Transport: year 501 on, port only. This is how armies cross.
   Frigate: 1581-1869, shipyard. Cheap escort.
   Ship of the Line: 1651-1869, shipyard. Heavy sail.
   Ironclad: 1856-1909, shipyard.
   Cruiser: year 1881 on. Fast.
   Battleship: year 1891 on, and you already built a line ship, ironclad, or cruiser. Expensive.
   Submarine: year 1901 on. Raids trade.
   Carrier: year 1918 on, and you have a battleship or a cruiser. Support, not the line.
4. Form one fleet: sailing, steam, or modern. That is the map counter.
5. Invasion, in order: embark, cross with an escort, fight the sea, land, hold the beachhead.
   Transports with no warship can draw Transports Without an Escort.

Sea control fires now and then if you have a fleet or a capital ship. It pays trade.
The Trade Does Not Arrive fires if you are large, late, and have none of the escort types.
Battleships you cannot afford draw The Battleships Are Too Many.

Doctrines are optional and separate: the line, the raid, or the landing.
Recurring trouble: pirates, mutiny, a yard accident, blockade, port strike, upkeep.

If you see a key like nav_port.t, reselect the language so Bundle.properties reloads.

The game has no separate naval-unit layer in the files a mod is allowed to add
without replacing the whole unit list. Replacing that list would delete vanilla
units, so this mod does not ship one. Ship types are squadrons you commission.
""",
    )
    lines = ["# Definitive Navy, English", ""]
    for key, value in STRINGS:
        lines.append(f"{key}={value}")
    lines.append("")
    write(MOD / "languages" / "Bundle.properties", "\n".join(lines))
    for event_id, image, slot, once, triggers, options in EVENTS:
        parts = list(triggers) + list(options)
        write(
            MOD / "game" / "events" / "common" / f"{event_id}.txt",
            render_event(event_id, image, slot, once, parts),
        )


def font(size: int, bold: bool = False):
    path = (
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
    )
    if Path(path).exists():
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def card(name: str, kind: str) -> None:
    w, h = 480, 270
    im = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(im)
    d.rectangle((10, 10, w - 11, h - 11), outline=GOLD, width=4)
    if kind == "port":
        d.rectangle((70, 150, 410, 210), fill=(20, 70, 110))
        d.polygon([(90, 150), (150, 90), (210, 150)], fill=GOLD)
        d.rectangle((120, 110, 160, 150), fill=(40, 48, 60))
        d.rectangle((250, 120, 390, 150), fill=(186, 150, 70))
    elif kind == "yard":
        d.polygon([(80, 200), (240, 70), (400, 200)], outline=GOLD)
        d.line((80, 200, 400, 200), fill=GOLD, width=6)
        d.polygon([(150, 200), (240, 100), (330, 200)], fill=(186, 150, 70))
    elif kind == "sail":
        d.polygon([(240, 40), (330, 190), (240, 170), (150, 190)], fill=(230, 226, 210))
        d.line((240, 40, 240, 220), fill=(90, 70, 40), width=6)
        d.polygon([(150, 210), (330, 210), (300, 235), (180, 235)], fill=(120, 80, 40))
    elif kind == "line":
        d.polygon([(120, 80), (200, 150), (120, 210)], fill=(230, 226, 210))
        d.polygon([(200, 70), (300, 150), (200, 220)], fill=WHITE)
        d.line((200, 50, 200, 230), fill=(70, 50, 30), width=7)
        d.rectangle((110, 214, 340, 236), fill=(90, 60, 36))
    elif kind == "steam":
        d.polygon([(90, 175), (390, 175), (350, 215), (130, 215)], fill=(70, 74, 78))
        d.rectangle((250, 110, 290, 175), fill=(50, 52, 56))
        d.ellipse((300, 80, 360, 120), fill=(180, 186, 190))
        d.rectangle((140, 145, 230, 175), fill=(40, 90, 70))
    elif kind == "modern":
        d.polygon([(70, 185), (410, 185), (370, 220), (110, 220)], fill=(60, 68, 78))
        d.polygon([(250, 185), (300, 120), (340, 185)], fill=(90, 98, 108))
        d.rectangle((150, 168, 230, 185), fill=(30, 36, 44))
        d.ellipse((300, 150, 360, 185), fill=(20, 24, 28))
    elif kind == "raid":
        d.ellipse((100, 150, 380, 210), fill=(36, 42, 48))
        d.polygon([(300, 150), (360, 128), (340, 180)], fill=(20, 24, 28))
        d.rectangle((40, 188, 440, 230), fill=SEA)
    elif kind == "storm":
        for y in (80, 120, 160, 200):
            d.arc((40, y, 440, y + 40), 200, 340, fill=(140, 186, 214), width=5)
        d.polygon([(250, 36), (270, 90), (230, 90)], fill=WHITE)
    else:
        d.ellipse((190, 80, 290, 180), outline=GOLD, width=8)
    out = MOD / "game" / "events" / "images" / "H" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)


def logo() -> None:
    w, h = 640, 360
    im = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(im)
    d.rectangle((16, 16, w - 17, h - 17), outline=GOLD, width=3)
    # Anchor
    cx, cy = 320, 132
    d.ellipse((cx - 16, cy - 58, cx + 16, cy - 26), outline=GOLD, width=6)
    d.line((cx, cy - 26, cx, cy + 48), fill=GOLD, width=8)
    d.line((cx - 46, cy - 4, cx + 46, cy - 4), fill=GOLD, width=8)
    d.arc((cx - 50, cy + 8, cx + 50, cy + 78), 20, 160, fill=GOLD, width=8)
    for y in (210, 228, 246):
        d.arc((90, y, 550, y + 28), 200, 340, fill=(90, 150, 190), width=3)
    d.text((w / 2, 286), "DEFINITIVE NAVY", font=font(42, True), fill=GOLD, anchor="mm")
    d.text((w / 2, 328), "AGE OF HISTORY II", font=font(16), fill=(168, 186, 206), anchor="mm")
    im.save(MOD / "logo.png")


def main() -> None:
    write_data()
    for name, kind in (
        ("port.png", "port"),
        ("yard.png", "yard"),
        ("sail.png", "sail"),
        ("line.png", "line"),
        ("steam.png", "steam"),
        ("modern.png", "modern"),
        ("raid.png", "raid"),
        ("storm.png", "storm"),
        ("treaty.png", "treaty"),
    ):
        card(name, kind)
    logo()
    print(f"Wrote {MOD}")


if __name__ == "__main__":
    main()
