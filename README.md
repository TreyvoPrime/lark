# Age of History II mods

Two mods for **Age of History II: Definitive Edition**. Copy each folder into the game's `mods` directory and enable it in the mod list.

- `DefinitiveNavy` — ports, shipyards, nine ship types, fleets, invasions, sea control, and upkeep.
- `CrownsOfTheAtlantic` — sixteen Atlantic civilizations, flags, and a charter-to-congress event chain.

## Definitive Navy

There was no earlier navy mod in this project, so this one is new. It plays on the game's event system, which is the layer a mod can add without replacing the vanilla unit list.

Commission squadrons instead of painting a sea icon on an army. Each ship type unlocks in its era and does a different job:

| Squadron | When | Job |
| --- | --- | --- |
| Galley | 401–1549 | Early fighting in coastal and inland seas |
| Transport | from 501 | Move an army across water |
| Frigate | 1581–1869 | Cheap escort |
| Ship of the Line | 1651–1869 | Heavy sailing battle |
| Ironclad | 1856–1909 | Industrial capital ship |
| Cruiser | from 1881 | Fast fleet work |
| Battleship | from 1891 | Heavy modern battle, and a large bill |
| Submarine | from 1901 | Commerce raids |
| Carrier | from 1918 | Fleet support for a landing |

A port comes first. A shipyard comes second and is what unlocks military hulls. Then you form **one** sailing, steam, or modern fleet. An invasion is five missions: embark, cross with an escort, fight through the defending sea, land, hold the beachhead. Transports with no warship can lose the crossing.

Sea control pays overseas income. A large country with none of the escort types loses trade instead. Battleships while the treasury is thin fire an upkeep crisis. Pirates, mutiny, yard accidents, blockades, strikes, an arms race, a treaty, and a naval conference are in the same list. Three doctrines cover the line, the raid, and the landing.

`DefinitiveNavy/INSTALL.txt` has the exact order and the year gates. Reselect the language if an event shows a raw key.

The base game can still walk a land army across a sea province. These missions are the naval rules on top of that: pay, escort, then land. The mod does not ship a replacement unit file, because that file would erase the vanilla armies.

## Crowns of the Atlantic

A mod for **Age of History II: Definitive Edition**. It adds sixteen Atlantic civilizations, flags, translations, and a chain of events that runs from a royal charter to a congress of recognition.

The civilizations are the chartered colonies and the states that broke from them: North Carolina, South Carolina, Virginia, New England, Acadia, New France, Louisiana, Florida, Saint-Domingue, Ayiti, Rio de la Plata, Gran Colombia, Texas, California, Liberia, and Cuba.

## Install

1. Copy the folder `CrownsOfTheAtlantic` into the game's `mods` directory, next to the other mods. The game should see `mods/CrownsOfTheAtlantic/mod.txt`.
2. Start the game and enable **Crowns of the Atlantic**.
3. Give one of the new tags some provinces in the scenario editor, or with **Add Civilization** before a game starts.

If a tag does not appear in the editor, append the lines in `CrownsOfTheAtlantic/reference/register.txt` to the base game's `game/Civilizations.txt`. Do not replace that file. This mod does not ship its own `Civilizations.txt`, because the game would load the mod copy instead of the full vanilla list.

`INSTALL.txt` inside the mod folder has the years each event can fire.

## What you can play

Chartered colonies (North Carolina, South Carolina, Virginia, New England, New France, Louisiana, Acadia, Florida) from 1607 through 1779 get **The Charter Is Read**. Later events follow if that civilization took the previous decision:

| Event | Needs |
| --- | --- |
| The Assembly Takes Its Seats | The charter, and more than one province |
| Stamps, Tea, and a Locked Door | The assembly, and a year from 1764 to 1799 |
| They Wrote It Down | The crisis, and a year after 1774 |
| A Frame of Government | The declaration, and more than three provinces |
| Congress of the Atlantic | The constitution, and a year after 1783 |
| The Crown Writes Back | The congress, and more than 40 gold |

Separate events fire for Ayiti or Saint-Domingue (1791–1805), Rio de la Plata (1809–1816), Gran Colombia (1819–1830), Texas (1836–1845), California (1846–1850), Liberia (1821–1847), and Cuba (1868–1898). From 1816 to 1847 the independent states can also take a seat at the congress.

Each event has two choices. One leans toward money or legitimacy, the other toward manpower and morale. The AI weights are on the `ai=` line of each button.

English, Spanish, French, German, and Polish strings are in `languages/`. If an event shows a key such as `atl_charter.t` instead of a sentence, reselect the language in the settings so the game reloads the bundle.

## Governments

`reference/governments-to-paste.txt` has three government types: a colonial assembly, a revolutionary republic, and a liberated state. Paste them into a **copy** of the game's `game/Governments.json`, then save the whole file as `mods/CrownsOfTheAtlantic/game/Governments.json`. The game replaces `Governments.json` rather than merging it, so a partial file would remove the vanilla governments.

## Rebuild

Flag and event art, the text files, and the translations are generated by:

```bash
python3 tools/build_mod.py
python3 tools/check_mod.py
```

`check_mod.py` confirms every event string exists in every language, every `is_civ` tag has a civilization file, and no file replaces the vanilla civilization or government lists.

Edit `tools/build_mod.py` and run it again. The folder you copy into `mods` is `CrownsOfTheAtlantic`.
