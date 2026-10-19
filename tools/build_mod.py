#!/usr/bin/env python3
"""Build the Crowns of the Atlantic mod folder.

Writes game data, translations, and flag art into CrownsOfTheAtlantic/.
Run from the repository root: python3 tools/build_mod.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "CrownsOfTheAtlantic"

# Map colors are the civilization colors the game reads from each JSON file.
CIVS = [
    ("ncarol", 15, 55, 130, "Province of North Carolina", "North Carolina"),
    ("scarol", 0, 105, 112, "Province of South Carolina", "South Carolina"),
    ("virgin", 120, 28, 48, "Colony of Virginia", "Virginia"),
    ("neweng", 176, 32, 40, "New England", "New England"),
    ("acadia", 0, 48, 135, "Acadia", "Acadia"),
    ("newfrn", 36, 58, 150, "New France", "New France"),
    ("louisn", 24, 78, 64, "Louisiana (New France)", "Louisiana"),
    ("ayiti", 0, 56, 168, "Haiti", "Ayiti"),
    ("stdomi", 90, 20, 30, "Saint-Domingue", "Saint-Domingue"),
    ("riopla", 74, 144, 196, "United Provinces of the Rio de la Plata", "Rio de la Plata"),
    ("grncol", 214, 168, 0, "Gran Colombia", "Gran Colombia"),
    ("texrep", 0, 82, 165, "Republic of Texas", "Texas"),
    ("calrep", 168, 56, 28, "California Republic", "California"),
    ("liberi", 0, 32, 96, "Liberia", "Liberia"),
    ("florid", 186, 140, 20, "Spanish Florida", "Florida"),
    ("cubrep", 196, 22, 48, "Republic of Cuba", "Cuba"),
]

NAVY = (14, 28, 51)
GOLD = (212, 175, 55)
WHITE = (255, 255, 255)
BLACK = (16, 16, 16)
RED = (191, 26, 38)
BLUE = (12, 46, 120)
GREEN = (24, 110, 58)
BROWN = (92, 58, 32)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def properties(entries: list[tuple[str, str]], header: str) -> str:
    lines = [f"# {header}", "# UTF-8. Keys are shared across every Bundle_*.properties file.", ""]
    for key, value in entries:
        if "\n" in value or "\r" in value:
            raise ValueError(f"newline in {key}")
        lines.append(f"{key}={value}")
    lines.append("")
    return "\n".join(lines)


def event(body: str) -> str:
    lines = [line.rstrip() for line in body.strip().splitlines()]
    if any(not line for line in lines):
        raise ValueError("event files cannot contain blank lines")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Copy. English is the source. Other languages cover the same keys.
# ---------------------------------------------------------------------------

EN: list[tuple[str, str]] = [
    ("ncarol", "North Carolina"),
    ("scarol", "South Carolina"),
    ("virgin", "Virginia"),
    ("neweng", "New England"),
    ("acadia", "Acadia"),
    ("newfrn", "New France"),
    ("louisn", "Louisiana"),
    ("ayiti", "Ayiti"),
    ("stdomi", "Saint-Domingue"),
    ("riopla", "Rio de la Plata"),
    ("grncol", "Gran Colombia"),
    ("texrep", "Texas"),
    ("calrep", "California"),
    ("liberi", "Liberia"),
    ("florid", "Florida"),
    ("cubrep", "Cuba"),
    ("L0", "A charter is a border that has not been surveyed yet."),
    ("L1", "The Atlantic is wide enough for two empires and a dozen arguments."),
    ("L2", "Assemblies remember taxes longer than kings remember assemblies."),
    ("L3", "Saint-Domingue cut more sugar than any colony, and then it stopped."),
    ("L4", "The cabildo of Buenos Aires opened its doors and found a country outside."),
    ("L5", "Gran Colombia was a sentence long enough to hold two oceans."),
    ("L6", "Texas wrote a declaration with more land than soldiers."),
    ("L7", "The Bear Flag Republic lasted weeks. The story lasted longer."),
    ("L8", "Liberia began as a constitution looking for a cape to land on."),
    ("L9", "Florida changed flags so often the forts kept the keys."),
    ("L10", "Recognition is a letter, a tariff, and a border nobody walked."),
    ("L11", "Crowns of the Atlantic: charter, revolt, congress."),
    ("atl_charter.t", "The Charter Is Read"),
    ("atl_charter.d", "A clerk unrolls the royal charter on the courthouse steps. It names the coast, the river, and the people allowed to settle them. The assembly wants the paper. The governor wants the quill."),
    ("atl_charter.m", "Hold a chartered colony on the Atlantic seaboard."),
    ("atl_charter.o1", "Take the crown's subsidy"),
    ("atl_charter.o2", "Keep the charter in the assembly"),
    ("atl_assembly.t", "The Assembly Takes Its Seats"),
    ("atl_assembly.d", "Planters, merchants, and militia captains fill the room. They vote a speaker, a tax, and a long grudge against anyone who would govern them from an ocean away."),
    ("atl_assembly.m", "Convene a colonial assembly after the charter."),
    ("atl_assembly.o1", "Vote a harbor tax"),
    ("atl_assembly.o2", "Raise the militia"),
    ("atl_crisis.t", "Stamps, Tea, and a Locked Door"),
    ("atl_crisis.d", "The latest imperial order arrives with a seal and a soldier. In the square, the crowd has already decided what it thinks of both."),
    ("atl_crisis.m", "Face the imperial tax crisis."),
    ("atl_crisis.o1", "Pay the levy and keep the ports open"),
    ("atl_crisis.o2", "Shut the warehouse"),
    ("atl_declare.t", "They Wrote It Down"),
    ("atl_declare.d", "The declaration is shorter than the argument that produced it. Once it is signed, the colony is a state in everything but the courtesy of kings."),
    ("atl_declare.m", "Declare independence from the crown."),
    ("atl_declare.o1", "Sign, and call the regiments"),
    ("atl_declare.o2", "Sign, and empty the treasury into the army"),
    ("atl_constit.t", "A Frame of Government"),
    ("atl_constit.d", "The war is not over, but the lawyers are already winning their part of it. A constitution will outlast the general who wants it delayed."),
    ("atl_constit.m", "Adopt a frame of government."),
    ("atl_constit.o1", "A strong assembly"),
    ("atl_constit.o2", "Emergency powers for the executive"),
    ("atl_congress.t", "Congress of the Atlantic"),
    ("atl_congress.d", "Envoys from both shores sit under one roof and pretend the ocean is a table. They trade recognition, debts, and the names of rivers."),
    ("atl_congress.m", "Send envoys to the Congress of the Atlantic."),
    ("atl_congress.o1", "Sign the open compact"),
    ("atl_congress.o2", "Sign, and keep a fleet budget"),
    ("atl_recog.t", "The Crown Writes Back"),
    ("atl_recog.d", "Recognition arrives as a letter, a trade list, and a border that nobody has surveyed. It is enough to borrow money against."),
    ("atl_recog.m", "Win formal recognition."),
    ("atl_recog.o1", "Accept the treaty"),
    ("atl_recog.o2", "Accept, and demand the river"),
    ("atl_seat.t", "A Chair at the Congress"),
    ("atl_seat.d", "An envoy asks for a chair, a tariff, and the courtesy of being called a country in public."),
    ("atl_seat.m", "Take a seat among the Atlantic states."),
    ("atl_seat.o1", "Take the chair"),
    ("atl_seat.o2", "Take the chair and an army subsidy"),
    ("ayiti_rise.t", "The Night the North Burned"),
    ("ayiti_rise.d", "In the north of Saint-Domingue the signal fires are already moving. The people who cut the cane have decided the cane will not cut them."),
    ("ayiti_rise.m", "Answer the rising in the north."),
    ("ayiti_rise.o1", "March with the uprising"),
    ("ayiti_rise.o2", "Hold the ports and wait"),
    ("ayiti_rep.t", "Ayiti"),
    ("ayiti_rep.d", "The new name is older than the colony. A republic is proclaimed over the same mountains, under a blue and a red that used to share a white band."),
    ("ayiti_rep.m", "Proclaim the republic of Ayiti."),
    ("ayiti_rep.o1", "Proclaim the republic"),
    ("ayiti_rep.o2", "Proclaim it, and arm the hills"),
    ("riopla_cab.t", "The Open Cabildo"),
    ("riopla_cab.d", "Buenos Aires opens the cabildo to the street. The viceroy's seal is still on the door. The people in the plaza are already talking like a country."),
    ("riopla_cab.m", "Open the cabildo in Buenos Aires."),
    ("riopla_cab.o1", "Form a junta"),
    ("riopla_cab.o2", "Arm the plaza"),
    ("grncol_cong.t", "The Congress at Angostura"),
    ("grncol_cong.d", "Delegates argue for a republic large enough to hold the Andes and the Caribbean in one sentence. The army outside is more interested in boots than in the sentence."),
    ("grncol_cong.m", "Hold the congress that would bind Gran Colombia."),
    ("grncol_cong.o1", "Publish the constitution"),
    ("grncol_cong.o2", "Keep the army in the field"),
    ("texrep_ind.t", "Remember the Garrison"),
    ("texrep_ind.d", "A small republic on a large river declares itself done with Mexico. The declaration is loud. The army is not."),
    ("texrep_ind.m", "Declare the Republic of Texas."),
    ("texrep_ind.o1", "Call every volunteer"),
    ("texrep_ind.o2", "Borrow against the cotton"),
    ("calrep_bear.t", "The Bear Flag"),
    ("calrep_bear.d", "Settlers at Sonoma pull down one flag and run up another: a star, a stripe, and a bear that nobody drew the same way twice. The republic is a few weeks wide."),
    ("calrep_bear.m", "Raise the Bear Flag."),
    ("calrep_bear.o1", "Hold the town"),
    ("calrep_bear.o2", "Open the port to whoever pays"),
    ("liberi_land.t", "The Landing at Cape Mesurado"),
    ("liberi_land.d", "The ship anchors off a green cape. The people coming ashore carry a constitution written on another continent, and a bargain that is still being argued on this one."),
    ("liberi_land.m", "Land the settlement at Cape Mesurado."),
    ("liberi_land.o1", "Plant the town"),
    ("liberi_land.o2", "Keep the militia on the beach"),
    ("cubrep_junta.t", "The Cry and the Junta"),
    ("cubrep_junta.d", "In the east of the island a junta claims a republic that Spain still calls a colony. The war will be fought in cane fields and in newspapers."),
    ("cubrep_junta.m", "Back the Cuban junta."),
    ("cubrep_junta.o1", "Fight for the republic"),
    ("cubrep_junta.o2", "Fund the expedition"),
]

ES: list[tuple[str, str]] = [
    ("ncarol", "Carolina del Norte"),
    ("scarol", "Carolina del Sur"),
    ("virgin", "Virginia"),
    ("neweng", "Nueva Inglaterra"),
    ("acadia", "Acadia"),
    ("newfrn", "Nueva Francia"),
    ("louisn", "Luisiana"),
    ("ayiti", "Ayiti"),
    ("stdomi", "Saint-Domingue"),
    ("riopla", "Río de la Plata"),
    ("grncol", "Gran Colombia"),
    ("texrep", "Texas"),
    ("calrep", "California"),
    ("liberi", "Liberia"),
    ("florid", "Florida"),
    ("cubrep", "Cuba"),
    ("L0", "Una carta de fundación es una frontera que nadie ha medido todavía."),
    ("L1", "El Atlántico cabe dos imperios y una docena de discusiones."),
    ("L2", "Las asambleas recuerdan los impuestos más que los reyes recuerdan las asambleas."),
    ("L3", "Saint-Domingue cortó más azúcar que ninguna colonia, y después dejó de hacerlo."),
    ("L4", "El cabildo de Buenos Aires abrió las puertas y encontró un país afuera."),
    ("L5", "La Gran Colombia fue una frase lo bastante larga para dos océanos."),
    ("L6", "Texas escribió una declaración con más tierra que soldados."),
    ("L7", "La República de la Bandera del Oso duró semanas. El relato duró más."),
    ("L8", "Liberia empezó como una constitución en busca de un cabo donde desembarcar."),
    ("L9", "Florida cambió de bandera tantas veces que los fuertes guardaron las llaves."),
    ("L10", "El reconocimiento es una carta, un arancel y una frontera que nadie recorrió."),
    ("L11", "Coronas del Atlántico: carta, revuelta, congreso."),
    ("atl_charter.t", "Se lee la carta"),
    ("atl_charter.d", "Un escribano despliega la carta real en la escalinata. Nombra la costa, el río y quién puede poblarlos. La asamblea quiere el papel. El gobernador quiere la pluma."),
    ("atl_charter.m", "Sostén una colonia con carta en la orilla atlántica."),
    ("atl_charter.o1", "Aceptar el subsidio de la corona"),
    ("atl_charter.o2", "Dejar la carta en la asamblea"),
    ("atl_assembly.t", "La asamblea ocupa sus escaños"),
    ("atl_assembly.d", "Plantadores, mercaderes y capitanes de milicia llenan la sala. Votan un presidente, un impuesto y un rencor largo contra quien pretenda gobernarlos desde el otro lado del mar."),
    ("atl_assembly.m", "Reúne una asamblea colonial después de la carta."),
    ("atl_assembly.o1", "Votar un impuesto de puerto"),
    ("atl_assembly.o2", "Levantar la milicia"),
    ("atl_crisis.t", "Sellos, té y una puerta cerrada"),
    ("atl_crisis.d", "La última orden imperial llega con un sello y un soldado. En la plaza, la multitud ya decidió qué piensa de ambos."),
    ("atl_crisis.m", "Afronta la crisis del impuesto imperial."),
    ("atl_crisis.o1", "Pagar el tributo y mantener los puertos"),
    ("atl_crisis.o2", "Cerrar el almacén"),
    ("atl_declare.t", "Lo pusieron por escrito"),
    ("atl_declare.d", "La declaración es más breve que la discusión que la produjo. Firmada, la colonia es un estado en todo menos en la cortesía de los reyes."),
    ("atl_declare.m", "Declara la independencia de la corona."),
    ("atl_declare.o1", "Firmar y llamar a los regimientos"),
    ("atl_declare.o2", "Firmar y vaciar el tesoro en el ejército"),
    ("atl_constit.t", "Un marco de gobierno"),
    ("atl_constit.d", "La guerra no ha terminado, pero los juristas ya ganan su parte. Una constitución durará más que el general que quiere aplazarla."),
    ("atl_constit.m", "Adopta un marco de gobierno."),
    ("atl_constit.o1", "Una asamblea fuerte"),
    ("atl_constit.o2", "Poderes de excepción para el ejecutivo"),
    ("atl_congress.t", "Congreso del Atlántico"),
    ("atl_congress.d", "Enviados de las dos orillas se sientan bajo un mismo techo y fingen que el océano es una mesa. Cambian reconocimiento, deudas y nombres de ríos."),
    ("atl_congress.m", "Envía delegados al Congreso del Atlántico."),
    ("atl_congress.o1", "Firmar el pacto abierto"),
    ("atl_congress.o2", "Firmar y guardar presupuesto para la flota"),
    ("atl_recog.t", "La corona contesta"),
    ("atl_recog.d", "El reconocimiento llega como una carta, una lista de comercio y una frontera que nadie midió. Alcanza para pedir dinero prestado."),
    ("atl_recog.m", "Consigue el reconocimiento formal."),
    ("atl_recog.o1", "Aceptar el tratado"),
    ("atl_recog.o2", "Aceptar y exigir el río"),
    ("atl_seat.t", "Una silla en el congreso"),
    ("atl_seat.d", "Un enviado pide una silla, un arancel y la cortesía de que lo llamen país en público."),
    ("atl_seat.m", "Toma asiento entre los estados del Atlántico."),
    ("atl_seat.o1", "Tomar la silla"),
    ("atl_seat.o2", "Tomar la silla y un subsidio para el ejército"),
    ("ayiti_rise.t", "La noche en que ardió el norte"),
    ("ayiti_rise.d", "En el norte de Saint-Domingue las hogueras ya se mueven. Quienes cortaban la caña decidieron que la caña no los cortaría a ellos."),
    ("ayiti_rise.m", "Responde al alzamiento del norte."),
    ("ayiti_rise.o1", "Marchar con el alzamiento"),
    ("ayiti_rise.o2", "Guardar los puertos y esperar"),
    ("ayiti_rep.t", "Ayiti"),
    ("ayiti_rep.d", "El nombre nuevo es más viejo que la colonia. Se proclama una república sobre las mismas montañas, bajo un azul y un rojo que antes compartían una franja blanca."),
    ("ayiti_rep.m", "Proclama la república de Ayiti."),
    ("ayiti_rep.o1", "Proclamar la república"),
    ("ayiti_rep.o2", "Proclamarla y armar las colinas"),
    ("riopla_cab.t", "El cabildo abierto"),
    ("riopla_cab.d", "Buenos Aires abre el cabildo a la calle. El sello del virrey sigue en la puerta. En la plaza ya hablan como un país."),
    ("riopla_cab.m", "Abre el cabildo en Buenos Aires."),
    ("riopla_cab.o1", "Formar una junta"),
    ("riopla_cab.o2", "Armar la plaza"),
    ("grncol_cong.t", "El congreso de Angostura"),
    ("grncol_cong.d", "Los delegados discuten una república lo bastante grande para los Andes y el Caribe en una sola frase. Al ejército de afuera le importan más las botas que la frase."),
    ("grncol_cong.m", "Celebra el congreso que habría de unir la Gran Colombia."),
    ("grncol_cong.o1", "Publicar la constitución"),
    ("grncol_cong.o2", "Mantener el ejército en campaña"),
    ("texrep_ind.t", "Recuerda la guarnición"),
    ("texrep_ind.d", "Una república pequeña sobre un río grande se declara terminada con México. La declaración es ruidosa. El ejército no."),
    ("texrep_ind.m", "Declara la República de Texas."),
    ("texrep_ind.o1", "Llamar a todos los voluntarios"),
    ("texrep_ind.o2", "Pedir prestado contra el algodón"),
    ("calrep_bear.t", "La bandera del oso"),
    ("calrep_bear.d", "En Sonoma arrian una bandera e izan otra: una estrella, una franja y un oso que nadie dibujó igual dos veces. La república tiene unas semanas de ancho."),
    ("calrep_bear.m", "Izá la bandera del oso."),
    ("calrep_bear.o1", "Defender el pueblo"),
    ("calrep_bear.o2", "Abrir el puerto a quien pague"),
    ("liberi_land.t", "El desembarco en el cabo Mesurado"),
    ("liberi_land.d", "El barco fondea frente a un cabo verde. Quienes bajan a tierra traen una constitución escrita en otro continente y un trato que aquí todavía se discute."),
    ("liberi_land.m", "Funda el asentamiento en el cabo Mesurado."),
    ("liberi_land.o1", "Plantar la ciudad"),
    ("liberi_land.o2", "Dejar la milicia en la playa"),
    ("cubrep_junta.t", "El grito y la junta"),
    ("cubrep_junta.d", "En el este de la isla una junta reclama una república que España sigue llamando colonia. La guerra se peleará en los cañaverales y en los periódicos."),
    ("cubrep_junta.m", "Apoya a la junta cubana."),
    ("cubrep_junta.o1", "Pelear por la república"),
    ("cubrep_junta.o2", "Pagar la expedición"),
]

FR: list[tuple[str, str]] = [
    ("ncarol", "Caroline du Nord"),
    ("scarol", "Caroline du Sud"),
    ("virgin", "Virginie"),
    ("neweng", "Nouvelle-Angleterre"),
    ("acadia", "Acadie"),
    ("newfrn", "Nouvelle-France"),
    ("louisn", "Louisiane"),
    ("ayiti", "Ayiti"),
    ("stdomi", "Saint-Domingue"),
    ("riopla", "Río de la Plata"),
    ("grncol", "Grande Colombie"),
    ("texrep", "Texas"),
    ("calrep", "Californie"),
    ("liberi", "Liberia"),
    ("florid", "Floride"),
    ("cubrep", "Cuba"),
    ("L0", "Une charte est une frontière que personne n'a encore arpentée."),
    ("L1", "L'Atlantique a la place de deux empires et d'une douzaine de disputes."),
    ("L2", "Les assemblées se souviennent des impôts plus longtemps que les rois des assemblées."),
    ("L3", "Saint-Domingue a coupé plus de sucre qu'aucune colonie, puis s'est arrêtée."),
    ("L4", "Le cabildo de Buenos Aires a ouvert ses portes et trouvé un pays dehors."),
    ("L5", "La Grande Colombie était une phrase assez longue pour deux océans."),
    ("L6", "Le Texas a écrit une déclaration avec plus de terre que de soldats."),
    ("L7", "La république du drapeau à l'ours a duré des semaines. Le récit a duré plus longtemps."),
    ("L8", "Le Liberia a commencé comme une constitution en quête d'un cap."),
    ("L9", "La Floride a changé de drapeau si souvent que les forts ont gardé les clés."),
    ("L10", "La reconnaissance est une lettre, un tarif, et une frontière que personne n'a marchée."),
    ("L11", "Couronnes de l'Atlantique : charte, révolte, congrès."),
    ("atl_charter.t", "On lit la charte"),
    ("atl_charter.d", "Un greffier déroule la charte royale sur les marches. Elle nomme la côte, le fleuve, et ceux qui peuvent s'y établir. L'assemblée veut le papier. Le gouverneur veut la plume."),
    ("atl_charter.m", "Tenir une colonie à charte sur le rivage atlantique."),
    ("atl_charter.o1", "Prendre la subvention de la couronne"),
    ("atl_charter.o2", "Garder la charte à l'assemblée"),
    ("atl_assembly.t", "L'assemblée prend ses sièges"),
    ("atl_assembly.d", "Planteurs, marchands et capitaines de milice emplissent la salle. Ils votent un président, un impôt, et une longue rancune contre qui prétend les gouverner depuis l'autre océan."),
    ("atl_assembly.m", "Réunir une assemblée coloniale après la charte."),
    ("atl_assembly.o1", "Voter une taxe de port"),
    ("atl_assembly.o2", "Lever la milice"),
    ("atl_crisis.t", "Timbres, thé et une porte close"),
    ("atl_crisis.d", "Le dernier ordre impérial arrive avec un sceau et un soldat. Sur la place, la foule a déjà tranché."),
    ("atl_crisis.m", "Affronter la crise de l'impôt impérial."),
    ("atl_crisis.o1", "Payer le tribut et garder les ports ouverts"),
    ("atl_crisis.o2", "Fermer l'entrepôt"),
    ("atl_declare.t", "Ils l'ont écrit"),
    ("atl_declare.d", "La déclaration est plus courte que la dispute qui l'a faite. Une fois signée, la colonie est un État en tout, sauf dans la politesse des rois."),
    ("atl_declare.m", "Déclarer l'indépendance de la couronne."),
    ("atl_declare.o1", "Signer et appeler les régiments"),
    ("atl_declare.o2", "Signer et vider le trésor dans l'armée"),
    ("atl_constit.t", "Un cadre de gouvernement"),
    ("atl_constit.d", "La guerre n'est pas finie, mais les juristes gagnent déjà leur part. Une constitution survivra au général qui veut la retarder."),
    ("atl_constit.m", "Adopter un cadre de gouvernement."),
    ("atl_constit.o1", "Une assemblée forte"),
    ("atl_constit.o2", "Des pouvoirs d'exception pour l'exécutif"),
    ("atl_congress.t", "Congrès de l'Atlantique"),
    ("atl_congress.d", "Des envoyés des deux rives s'assoient sous le même toit et font semblant que l'océan est une table. Ils échangent reconnaissance, dettes et noms de fleuves."),
    ("atl_congress.m", "Envoyer des députés au Congrès de l'Atlantique."),
    ("atl_congress.o1", "Signer le pacte ouvert"),
    ("atl_congress.o2", "Signer et garder un budget pour la flotte"),
    ("atl_recog.t", "La couronne répond"),
    ("atl_recog.d", "La reconnaissance arrive comme une lettre, une liste commerciale et une frontière que personne n'a mesurée. Cela suffit pour emprunter."),
    ("atl_recog.m", "Obtenir la reconnaissance formelle."),
    ("atl_recog.o1", "Accepter le traité"),
    ("atl_recog.o2", "Accepter, et exiger le fleuve"),
    ("atl_seat.t", "Une chaise au congrès"),
    ("atl_seat.d", "Un envoyé demande une chaise, un tarif, et la politesse d'être appelé un pays en public."),
    ("atl_seat.m", "Prendre siège parmi les États de l'Atlantique."),
    ("atl_seat.o1", "Prendre la chaise"),
    ("atl_seat.o2", "Prendre la chaise et une subvention pour l'armée"),
    ("ayiti_rise.t", "La nuit où le nord a brûlé"),
    ("ayiti_rise.d", "Dans le nord de Saint-Domingue, les feux bougent déjà. Ceux qui coupaient la canne ont décidé que la canne ne les couperait plus."),
    ("ayiti_rise.m", "Répondre au soulèvement du nord."),
    ("ayiti_rise.o1", "Marcher avec le soulèvement"),
    ("ayiti_rise.o2", "Tenir les ports et attendre"),
    ("ayiti_rep.t", "Ayiti"),
    ("ayiti_rep.d", "Le nouveau nom est plus ancien que la colonie. Une république est proclamée sur les mêmes montagnes, sous un bleu et un rouge qui partageaient une bande blanche."),
    ("ayiti_rep.m", "Proclamer la république d'Ayiti."),
    ("ayiti_rep.o1", "Proclamer la république"),
    ("ayiti_rep.o2", "La proclamer, et armer les collines"),
    ("riopla_cab.t", "Le cabildo ouvert"),
    ("riopla_cab.d", "Buenos Aires ouvre le cabildo à la rue. Le sceau du vice-roi est encore sur la porte. Sur la place, on parle déjà comme un pays."),
    ("riopla_cab.m", "Ouvrir le cabildo à Buenos Aires."),
    ("riopla_cab.o1", "Former une junte"),
    ("riopla_cab.o2", "Armer la place"),
    ("grncol_cong.t", "Le congrès d'Angostura"),
    ("grncol_cong.d", "Les délégués disputent une république assez grande pour les Andes et la Caraïbe dans une seule phrase. L'armée dehors s'intéresse plus aux bottes qu'à la phrase."),
    ("grncol_cong.m", "Tenir le congrès qui devait lier la Grande Colombie."),
    ("grncol_cong.o1", "Publier la constitution"),
    ("grncol_cong.o2", "Garder l'armée en campagne"),
    ("texrep_ind.t", "Souvenez-vous de la garnison"),
    ("texrep_ind.d", "Une petite république sur un grand fleuve se déclare quitte avec le Mexique. La déclaration est bruyante. L'armée ne l'est pas."),
    ("texrep_ind.m", "Déclarer la République du Texas."),
    ("texrep_ind.o1", "Appeler tous les volontaires"),
    ("texrep_ind.o2", "Emprunter sur le coton"),
    ("calrep_bear.t", "Le drapeau à l'ours"),
    ("calrep_bear.d", "À Sonoma on amène un drapeau et on en hisse un autre : une étoile, une bande, et un ours que personne n'a dessiné deux fois de la même façon. La république a quelques semaines de large."),
    ("calrep_bear.m", "Hisser le drapeau à l'ours."),
    ("calrep_bear.o1", "Tenir la ville"),
    ("calrep_bear.o2", "Ouvrir le port à qui paie"),
    ("liberi_land.t", "Le débarquement au cap Mesurado"),
    ("liberi_land.d", "Le navire mouille devant un cap vert. Ceux qui descendent à terre portent une constitution écrite sur un autre continent, et un marché que l'on discute encore ici."),
    ("liberi_land.m", "Fonder la colonie au cap Mesurado."),
    ("liberi_land.o1", "Planter la ville"),
    ("liberi_land.o2", "Laisser la milice sur la plage"),
    ("cubrep_junta.t", "Le cri et la junte"),
    ("cubrep_junta.d", "Dans l'est de l'île, une junte revendique une république que l'Espagne appelle encore une colonie. La guerre se fera dans les champs de canne et dans les journaux."),
    ("cubrep_junta.m", "Soutenir la junte cubaine."),
    ("cubrep_junta.o1", "Combattre pour la république"),
    ("cubrep_junta.o2", "Financer l'expédition"),
]

DE: list[tuple[str, str]] = [
    ("ncarol", "North Carolina"),
    ("scarol", "South Carolina"),
    ("virgin", "Virginia"),
    ("neweng", "Neuengland"),
    ("acadia", "Akadien"),
    ("newfrn", "Neufrankreich"),
    ("louisn", "Louisiana"),
    ("ayiti", "Ayiti"),
    ("stdomi", "Saint-Domingue"),
    ("riopla", "Río de la Plata"),
    ("grncol", "Großkolumbien"),
    ("texrep", "Texas"),
    ("calrep", "Kalifornien"),
    ("liberi", "Liberia"),
    ("florid", "Florida"),
    ("cubrep", "Kuba"),
    ("L0", "Eine Charta ist eine Grenze, die noch niemand vermessen hat."),
    ("L1", "Der Atlantik hat Platz für zwei Reiche und ein Dutzend Streitfragen."),
    ("L2", "Versammlungen merken sich Steuern länger als Könige Versammlungen."),
    ("L3", "Saint-Domingue schnitt mehr Zucker als jede andere Kolonie, und hörte dann auf."),
    ("L4", "Das Cabildo von Buenos Aires öffnete die Türen und fand draußen ein Land."),
    ("L5", "Großkolumbien war ein Satz, lang genug für zwei Ozeane."),
    ("L6", "Texas schrieb eine Erklärung mit mehr Land als Soldaten."),
    ("L7", "Die Bärenflaggenrepublik hielt Wochen. Die Geschichte hielt länger."),
    ("L8", "Liberia begann als Verfassung auf der Suche nach einem Kap."),
    ("L9", "Florida wechselte die Flagge so oft, dass die Forts die Schlüssel behielten."),
    ("L10", "Anerkennung ist ein Brief, ein Zoll und eine Grenze, die niemand ging."),
    ("L11", "Kronen des Atlantiks: Charta, Aufstand, Kongress."),
    ("atl_charter.t", "Die Charta wird verlesen"),
    ("atl_charter.d", "Ein Schreiber rollt die königliche Charta auf den Stufen aus. Sie nennt die Küste, den Fluss und wer sich dort niederlassen darf. Die Versammlung will das Papier. Der Gouverneur will die Feder."),
    ("atl_charter.m", "Halte eine beurkundete Kolonie an der Atlantikküste."),
    ("atl_charter.o1", "Die Unterstützung der Krone annehmen"),
    ("atl_charter.o2", "Die Charta in der Versammlung behalten"),
    ("atl_assembly.t", "Die Versammlung setzt sich"),
    ("atl_assembly.d", "Pflanzer, Kaufleute und Milizhauptleute füllen den Saal. Sie wählen einen Sprecher, eine Steuer und einen langen Groll gegen jeden, der sie von jenseits des Meeres regieren will."),
    ("atl_assembly.m", "Berufe nach der Charta eine Kolonialversammlung ein."),
    ("atl_assembly.o1", "Eine Hafensteuer beschließen"),
    ("atl_assembly.o2", "Die Miliz ausheben"),
    ("atl_crisis.t", "Stempel, Tee und eine verschlossene Tür"),
    ("atl_crisis.d", "Der jüngste kaiserliche Befehl kommt mit Siegel und Soldat. Auf dem Platz hat die Menge bereits entschieden."),
    ("atl_crisis.m", "Stelle dich der kaiserlichen Steuerkrise."),
    ("atl_crisis.o1", "Die Abgabe zahlen und die Häfen offen halten"),
    ("atl_crisis.o2", "Das Lagerhaus schließen"),
    ("atl_declare.t", "Sie haben es aufgeschrieben"),
    ("atl_declare.d", "Die Erklärung ist kürzer als der Streit, der sie hervorbrachte. Einmal unterzeichnet, ist die Kolonie ein Staat in allem außer der Höflichkeit der Könige."),
    ("atl_declare.m", "Erkläre die Unabhängigkeit von der Krone."),
    ("atl_declare.o1", "Unterschreiben und die Regimenter rufen"),
    ("atl_declare.o2", "Unterschreiben und die Kasse ins Heer leeren"),
    ("atl_constit.t", "Ein Rahmen der Regierung"),
    ("atl_constit.d", "Der Krieg ist nicht vorbei, aber die Juristen gewinnen bereits ihren Teil. Eine Verfassung überdauert den General, der sie aufschieben will."),
    ("atl_constit.m", "Nimm eine Regierungsform an."),
    ("atl_constit.o1", "Eine starke Versammlung"),
    ("atl_constit.o2", "Notstandsbefugnisse für die Exekutive"),
    ("atl_congress.t", "Kongress des Atlantiks"),
    ("atl_congress.d", "Gesandte beider Ufer sitzen unter einem Dach und tun, als sei der Ozean ein Tisch. Sie tauschen Anerkennung, Schulden und Flussnamen."),
    ("atl_congress.m", "Schicke Gesandte zum Kongress des Atlantiks."),
    ("atl_congress.o1", "Den offenen Vertrag unterzeichnen"),
    ("atl_congress.o2", "Unterzeichnen und ein Flottenbudget behalten"),
    ("atl_recog.t", "Die Krone schreibt zurück"),
    ("atl_recog.d", "Anerkennung kommt als Brief, Handelsliste und eine Grenze, die niemand vermessen hat. Sie genügt, um Geld darauf zu leihen."),
    ("atl_recog.m", "Erringe die förmliche Anerkennung."),
    ("atl_recog.o1", "Den Vertrag annehmen"),
    ("atl_recog.o2", "Annehmen und den Fluss verlangen"),
    ("atl_seat.t", "Ein Stuhl auf dem Kongress"),
    ("atl_seat.d", "Ein Gesandter bittet um einen Stuhl, einen Zoll und die Höflichkeit, in der Öffentlichkeit ein Land genannt zu werden."),
    ("atl_seat.m", "Nimm Platz unter den Staaten des Atlantiks."),
    ("atl_seat.o1", "Den Stuhl nehmen"),
    ("atl_seat.o2", "Den Stuhl und einen Heereszuschuss nehmen"),
    ("ayiti_rise.t", "Die Nacht, in der der Norden brannte"),
    ("ayiti_rise.d", "Im Norden von Saint-Domingue ziehen die Signalfeuer schon. Die Menschen, die das Rohr schnitten, haben entschieden, dass das Rohr sie nicht schneiden wird."),
    ("ayiti_rise.m", "Antworte auf den Aufstand im Norden."),
    ("ayiti_rise.o1", "Mit dem Aufstand marschieren"),
    ("ayiti_rise.o2", "Die Häfen halten und warten"),
    ("ayiti_rep.t", "Ayiti"),
    ("ayiti_rep.d", "Der neue Name ist älter als die Kolonie. Eine Republik wird über denselben Bergen ausgerufen, unter einem Blau und einem Rot, die einmal ein weißes Band teilten."),
    ("ayiti_rep.m", "Rufe die Republik Ayiti aus."),
    ("ayiti_rep.o1", "Die Republik ausrufen"),
    ("ayiti_rep.o2", "Sie ausrufen und die Hügel bewaffnen"),
    ("riopla_cab.t", "Das offene Cabildo"),
    ("riopla_cab.d", "Buenos Aires öffnet das Cabildo zur Straße. Das Siegel des Vizekönigs hängt noch an der Tür. Auf dem Platz spricht man bereits wie ein Land."),
    ("riopla_cab.m", "Öffne das Cabildo in Buenos Aires."),
    ("riopla_cab.o1", "Eine Junta bilden"),
    ("riopla_cab.o2", "Den Platz bewaffnen"),
    ("grncol_cong.t", "Der Kongress von Angostura"),
    ("grncol_cong.d", "Die Abgeordneten streiten um eine Republik, groß genug für die Anden und die Karibik in einem Satz. Das Heer draußen interessiert sich mehr für Stiefel als für den Satz."),
    ("grncol_cong.m", "Halte den Kongress, der Großkolumbien binden sollte."),
    ("grncol_cong.o1", "Die Verfassung veröffentlichen"),
    ("grncol_cong.o2", "Das Heer im Feld lassen"),
    ("texrep_ind.t", "Gedenkt der Garnison"),
    ("texrep_ind.d", "Eine kleine Republik an einem großen Fluss erklärt sich mit Mexiko fertig. Die Erklärung ist laut. Das Heer ist es nicht."),
    ("texrep_ind.m", "Erkläre die Republik Texas."),
    ("texrep_ind.o1", "Jeden Freiwilligen rufen"),
    ("texrep_ind.o2", "Auf die Baumwolle borgen"),
    ("calrep_bear.t", "Die Bärenflagge"),
    ("calrep_bear.d", "In Sonoma holt man eine Flagge ein und hisst eine andere: ein Stern, ein Streifen und ein Bär, den niemand zweimal gleich zeichnete. Die Republik ist ein paar Wochen breit."),
    ("calrep_bear.m", "Hiss die Bärenflagge."),
    ("calrep_bear.o1", "Die Stadt halten"),
    ("calrep_bear.o2", "Den Hafen öffnen für jeden, der zahlt"),
    ("liberi_land.t", "Die Landung am Kap Mesurado"),
    ("liberi_land.d", "Das Schiff ankert vor einem grünen Kap. Wer an Land geht, trägt eine Verfassung von einem anderen Kontinent und einen Handel, über den man hier noch streitet."),
    ("liberi_land.m", "Gründe die Siedlung am Kap Mesurado."),
    ("liberi_land.o1", "Die Stadt pflanzen"),
    ("liberi_land.o2", "Die Miliz am Strand lassen"),
    ("cubrep_junta.t", "Der Schrei und die Junta"),
    ("cubrep_junta.d", "Im Osten der Insel beansprucht eine Junta eine Republik, die Spanien noch eine Kolonie nennt. Der Krieg wird in Zuckerfeldern und in Zeitungen geführt."),
    ("cubrep_junta.m", "Unterstütze die kubanische Junta."),
    ("cubrep_junta.o1", "Für die Republik kämpfen"),
    ("cubrep_junta.o2", "Die Expedition bezahlen"),
]

PL: list[tuple[str, str]] = [
    ("ncarol", "Karolina Północna"),
    ("scarol", "Karolina Południowa"),
    ("virgin", "Wirginia"),
    ("neweng", "Nowa Anglia"),
    ("acadia", "Akadia"),
    ("newfrn", "Nowa Francja"),
    ("louisn", "Luizjana"),
    ("ayiti", "Ayiti"),
    ("stdomi", "Saint-Domingue"),
    ("riopla", "La Plata"),
    ("grncol", "Wielka Kolumbia"),
    ("texrep", "Teksas"),
    ("calrep", "Kalifornia"),
    ("liberi", "Liberia"),
    ("florid", "Floryda"),
    ("cubrep", "Kuba"),
    ("L0", "Karta osiedlenia to granica, której nikt jeszcze nie pomierzył."),
    ("L1", "Atlantyk mieści dwa imperia i tuzin sporów."),
    ("L2", "Zgromadzenia pamiętają podatki dłużej niż królowie zgromadzenia."),
    ("L3", "Saint-Domingue wycinało więcej cukru niż jakakolwiek kolonia, a potem przestało."),
    ("L4", "Cabildo w Buenos Aires otworzyło drzwi i zastało za nimi kraj."),
    ("L5", "Wielka Kolumbia była zdaniem dość długim na dwa oceany."),
    ("L6", "Teksas napisał deklarację, w której było więcej ziemi niż żołnierzy."),
    ("L7", "Republika niedźwiedziego sztandaru trwała tygodnie. Opowieść trwała dłużej."),
    ("L8", "Liberia zaczęła się jako konstytucja szukająca przylądka."),
    ("L9", "Floryda zmieniała flagę tak często, że forty zatrzymały klucze."),
    ("L10", "Uznanie to list, cło i granica, której nikt nie przeszedł."),
    ("L11", "Korony Atlantyku: karta, bunt, kongres."),
    ("atl_charter.t", "Odczytują kartę"),
    ("atl_charter.d", "Pisarz rozwija królewską kartę na schodach. Wymienia wybrzeże, rzekę i tych, którzy mogą się tam osiedlić. Zgromadzenie chce papieru. Gubernator chce pióra."),
    ("atl_charter.m", "Utrzymaj kolonię z kartą na atlantyckim brzegu."),
    ("atl_charter.o1", "Przyjąć wsparcie korony"),
    ("atl_charter.o2", "Zostawić kartę w zgromadzeniu"),
    ("atl_assembly.t", "Zgromadzenie zajmuje miejsca"),
    ("atl_assembly.d", "Plantatorzy, kupcy i kapitanowie milicji wypełniają salę. Głosują mówcę, podatek i długą urazę do każdego, kto chciałby rządzić nimi zza oceanu."),
    ("atl_assembly.m", "Zwołaj zgromadzenie kolonialne po karcie."),
    ("atl_assembly.o1", "Uchwalić podatek portowy"),
    ("atl_assembly.o2", "Powołać milicję"),
    ("atl_crisis.t", "Stemple, herbata i zamknięte drzwi"),
    ("atl_crisis.d", "Najnowszy rozkaz imperium przychodzi z pieczęcią i żołnierzem. Na placu tłum już postanowił, co o obu sądzi."),
    ("atl_crisis.m", "Staw czoła kryzysowi imperialnego podatku."),
    ("atl_crisis.o1", "Zapłacić daninę i zostawić porty otwarte"),
    ("atl_crisis.o2", "Zamknąć magazyn"),
    ("atl_declare.t", "Zapisali to"),
    ("atl_declare.d", "Deklaracja jest krótsza niż spór, który ją wydał. Po podpisie kolonia jest państwem we wszystkim poza uprzejmością królów."),
    ("atl_declare.m", "Ogłoś niepodległość od korony."),
    ("atl_declare.o1", "Podpisać i wezwać pułki"),
    ("atl_declare.o2", "Podpisać i przelać skarb do armii"),
    ("atl_constit.t", "Ramy rządu"),
    ("atl_constit.d", "Wojna się nie skończyła, ale prawnicy już wygrywają swoją część. Konstytucja przeżyje generała, który chce ją odłożyć."),
    ("atl_constit.m", "Przyjmij ustrój."),
    ("atl_constit.o1", "Silne zgromadzenie"),
    ("atl_constit.o2", "Nadzwyczajne uprawnienia dla władzy wykonawczej"),
    ("atl_congress.t", "Kongres Atlantyku"),
    ("atl_congress.d", "Posłowie z obu brzegów siedzą pod jednym dachem i udają, że ocean jest stołem. Wymieniają uznanie, długi i nazwy rzek."),
    ("atl_congress.m", "Wyślij posłów na Kongres Atlantyku."),
    ("atl_congress.o1", "Podpisać otwarty układ"),
    ("atl_congress.o2", "Podpisać i zostawić budżet floty"),
    ("atl_recog.t", "Korona odpisuje"),
    ("atl_recog.d", "Uznanie przychodzi jako list, lista handlu i granica, której nikt nie pomierzył. Wystarczy, by pożyczyć pod nią pieniądze."),
    ("atl_recog.m", "Zdobądź formalne uznanie."),
    ("atl_recog.o1", "Przyjąć traktat"),
    ("atl_recog.o2", "Przyjąć i zażądać rzeki"),
    ("atl_seat.t", "Krzesło na kongresie"),
    ("atl_seat.d", "Poseł prosi o krzesło, cło i uprzejmość nazywania go krajem publicznie."),
    ("atl_seat.m", "Zajmij miejsce wśród państw Atlantyku."),
    ("atl_seat.o1", "Zająć krzesło"),
    ("atl_seat.o2", "Zająć krzesło i dopłatę dla armii"),
    ("ayiti_rise.t", "Noc, w której zapłonął północ"),
    ("ayiti_rise.d", "Na północy Saint-Domingue ogniska już idą. Ludzie, którzy cięli trzcinę, postanowili, że trzcina nie będzie ciąć ich."),
    ("ayiti_rise.m", "Odpowiedz na powstanie na północy."),
    ("ayiti_rise.o1", "Maszerować z powstaniem"),
    ("ayiti_rise.o2", "Trzymać porty i czekać"),
    ("ayiti_rep.t", "Ayiti"),
    ("ayiti_rep.d", "Nowa nazwa jest starsza niż kolonia. Republikę ogłasza się nad tymi samymi górami, pod błękitem i czerwienią, które kiedyś dzieliły biały pas."),
    ("ayiti_rep.m", "Ogłoś republikę Ayiti."),
    ("ayiti_rep.o1", "Ogłosić republikę"),
    ("ayiti_rep.o2", "Ogłosić ją i uzbroić wzgórza"),
    ("riopla_cab.t", "Otwarte cabildo"),
    ("riopla_cab.d", "Buenos Aires otwiera cabildo na ulicę. Pieczęć wicekróla wciąż jest na drzwiach. Na placu mówią już jak kraj."),
    ("riopla_cab.m", "Otwórz cabildo w Buenos Aires."),
    ("riopla_cab.o1", "Utworzyć juntę"),
    ("riopla_cab.o2", "Uzbroić plac"),
    ("grncol_cong.t", "Kongres w Angosturze"),
    ("grncol_cong.d", "Delegaci spierają się o republikę dość dużą, by Andy i Karaiby zmieściły się w jednym zdaniu. Armii na zewnątrz bardziej zależą na butach niż na zdaniu."),
    ("grncol_cong.m", "Zwołaj kongres, który miał związać Wielką Kolumbię."),
    ("grncol_cong.o1", "Ogłosić konstytucję"),
    ("grncol_cong.o2", "Zostawić armię w polu"),
    ("texrep_ind.t", "Pamiętaj o garnizonie"),
    ("texrep_ind.d", "Mała republika nad wielką rzeką ogłasza, że skończyła z Meksykiem. Deklaracja jest głośna. Armia nie."),
    ("texrep_ind.m", "Ogłoś Republikę Teksasu."),
    ("texrep_ind.o1", "Wezwać każdego ochotnika"),
    ("texrep_ind.o2", "Pożyczyć pod bawełnę"),
    ("calrep_bear.t", "Flaga z niedźwiedziem"),
    ("calrep_bear.d", "W Sonomie opuszczają jedną flagę i wciągają inną: gwiazda, pas i niedźwiedź, którego nikt nie narysował dwa razy tak samo. Republika ma kilka tygodni szerokości."),
    ("calrep_bear.m", "Podnieś flagę z niedźwiedziem."),
    ("calrep_bear.o1", "Utrzymać miasto"),
    ("calrep_bear.o2", "Otworzyć port temu, kto zapłaci"),
    ("liberi_land.t", "Lądowanie na przylądku Mesurado"),
    ("liberi_land.d", "Statek staje na kotwicy przy zielonym przylądku. Schodzący na ląd niosą konstytucję napisaną na innym kontynencie i układ, o który tutaj wciąż się spierają."),
    ("liberi_land.m", "Załóż osadę na przylądku Mesurado."),
    ("liberi_land.o1", "Zasadzić miasto"),
    ("liberi_land.o2", "Zostawić milicję na plaży"),
    ("cubrep_junta.t", "Okrzyk i junta"),
    ("cubrep_junta.d", "Na wschodzie wyspy junta ogłasza republikę, którą Hiszpania wciąż nazywa kolonią. Wojna pójdzie w trzcinie i w gazetach."),
    ("cubrep_junta.m", "Poprzyj kubańską juntę."),
    ("cubrep_junta.o1", "Walczyć za republikę"),
    ("cubrep_junta.o2", "Opłacić wyprawę"),
]


EVENTS = {
    "atl_charter": """
id=atl_charter
title=atl_charter.t
desc=atl_charter.d
mission_desc=atl_charter.m
image=charter.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
year_over=1606
next_and
year_below=1780
trigger_and_end
trigger_or
next_or
is_civ=ncarol
next_or
is_civ=scarol
next_or
is_civ=virgin
next_or
is_civ=neweng
next_or
is_civ=newfrn
next_or
is_civ=louisn
next_or
is_civ=acadia
next_or
is_civ=florid
trigger_or_end
option_btn
name=atl_charter.o1
ai=40
gold=180
option_end
option_btn
name=atl_charter.o2
ai=60
legacy=30
bonus_duration=15
bonus_monthly_income=8
option_end
""",
    "atl_assembly": """
id=atl_assembly
title=atl_assembly.t
desc=atl_assembly.d
mission_desc=atl_assembly.m
image=assembly.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
has_variable=atl_charter
next_and
civ_provinces_over=1
trigger_and_end
option_btn
name=atl_assembly.o1
ai=50
gold=80
legacy=10
option_end
option_btn
name=atl_assembly.o2
ai=50
province_manpower=1.4
legacy=15
option_end
""",
    "atl_crisis": """
id=atl_crisis
title=atl_crisis.t
desc=atl_crisis.d
mission_desc=atl_crisis.m
image=crisis.png
show_in_missions=true
mission_image=2
popUp=true
only_once=true
trigger_and
next_and
has_variable=atl_assembly
next_and
year_over=1763
next_and
year_below=1800
trigger_and_end
option_btn
name=atl_crisis.o1
ai=35
province_manpower=0.6
gold=40
option_end
option_btn
name=atl_crisis.o2
ai=65
legacy=20
bonus_duration=10
bonus_max_morale=4
option_end
""",
    "atl_declare": """
id=atl_declare
title=atl_declare.t
desc=atl_declare.d
mission_desc=atl_declare.m
image=declare.png
show_in_missions=true
mission_image=2
popUp=true
only_once=true
trigger_and
next_and
has_variable=atl_crisis
next_and
year_over=1774
trigger_and_end
option_btn
name=atl_declare.o1
ai=80
province_manpower=2
bonus_duration=12
bonus_max_morale=6
bonus_army_morale_recovery=8
option_end
option_btn
name=atl_declare.o2
ai=20
gold=40
province_manpower=1.2
option_end
""",
    "atl_constit": """
id=atl_constit
title=atl_constit.t
desc=atl_constit.d
mission_desc=atl_constit.m
image=constit.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
has_variable=atl_declare
next_and
civ_provinces_over=3
trigger_and_end
option_btn
name=atl_constit.o1
ai=70
legacy=40
bonus_duration=20
bonus_monthly_income=12
option_end
option_btn
name=atl_constit.o2
ai=30
province_manpower=1.6
bonus_duration=8
bonus_max_morale=5
option_end
""",
    "atl_congress": """
id=atl_congress
title=atl_congress.t
desc=atl_congress.d
mission_desc=atl_congress.m
image=congress.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
has_variable=atl_constit
next_and
year_over=1783
trigger_and_end
option_btn
name=atl_congress.o1
ai=60
legacy=50
gold=120
option_end
option_btn
name=atl_congress.o2
ai=40
gold=40
province_manpower=1
bonus_duration=15
bonus_monthly_income=10
option_end
""",
    "atl_recog": """
id=atl_recog
title=atl_recog.t
desc=atl_recog.d
mission_desc=atl_recog.m
image=recog.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
has_variable=atl_congress
next_and
civ_gold_over=40
trigger_and_end
option_btn
name=atl_recog.o1
ai=80
gold=250
legacy=35
option_end
option_btn
name=atl_recog.o2
ai=20
legacy=20
province_economy_capital=12
option_end
""",
    "atl_seat": """
id=atl_seat
title=atl_seat.t
desc=atl_seat.d
mission_desc=atl_seat.m
image=congress.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
year_over=1815
next_and
year_below=1848
trigger_and_end
trigger_or
next_or
is_civ=ayiti
next_or
is_civ=riopla
next_or
is_civ=grncol
next_or
is_civ=texrep
next_or
is_civ=calrep
next_or
is_civ=liberi
next_or
is_civ=cubrep
trigger_or_end
option_btn
name=atl_seat.o1
ai=70
legacy=30
gold=90
option_end
option_btn
name=atl_seat.o2
ai=30
gold=40
province_manpower=1
option_end
""",
    "ayiti_rise": """
id=ayiti_rise
title=ayiti_rise.t
desc=ayiti_rise.d
mission_desc=ayiti_rise.m
image=rise.png
show_in_missions=true
mission_image=2
popUp=true
only_once=true
trigger_and
next_and
year_over=1790
next_and
year_below=1806
trigger_and_end
trigger_or
next_or
is_civ=stdomi
next_or
is_civ=ayiti
trigger_or_end
option_btn
name=ayiti_rise.o1
ai=85
province_manpower=2.2
bonus_duration=10
bonus_max_morale=8
option_end
option_btn
name=ayiti_rise.o2
ai=15
gold=60
option_end
""",
    "ayiti_rep": """
id=ayiti_rep
title=ayiti_rep.t
desc=ayiti_rep.d
mission_desc=ayiti_rep.m
image=republic.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
has_variable=ayiti_rise
trigger_and_end
option_btn
name=ayiti_rep.o1
ai=70
legacy=60
bonus_duration=20
bonus_monthly_income=6
option_end
option_btn
name=ayiti_rep.o2
ai=30
province_manpower=1.8
bonus_duration=12
bonus_max_morale=6
option_end
""",
    "riopla_cab": """
id=riopla_cab
title=riopla_cab.t
desc=riopla_cab.d
mission_desc=riopla_cab.m
image=cabildo.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
is_civ=riopla
next_and
year_over=1808
next_and
year_below=1817
trigger_and_end
option_btn
name=riopla_cab.o1
ai=75
legacy=40
gold=70
option_end
option_btn
name=riopla_cab.o2
ai=25
province_manpower=1.5
bonus_duration=8
bonus_max_morale=5
option_end
""",
    "grncol_cong": """
id=grncol_cong
title=grncol_cong.t
desc=grncol_cong.d
mission_desc=grncol_cong.m
image=angostura.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
is_civ=grncol
next_and
year_over=1818
next_and
year_below=1831
trigger_and_end
option_btn
name=grncol_cong.o1
ai=65
legacy=45
bonus_duration=18
bonus_monthly_income=8
option_end
option_btn
name=grncol_cong.o2
ai=35
province_manpower=2
bonus_duration=10
bonus_max_morale=5
option_end
""",
    "texrep_ind": """
id=texrep_ind
title=texrep_ind.t
desc=texrep_ind.d
mission_desc=texrep_ind.m
image=declare.png
show_in_missions=true
mission_image=2
popUp=true
only_once=true
trigger_and
next_and
is_civ=texrep
next_and
year_over=1835
next_and
year_below=1846
trigger_and_end
option_btn
name=texrep_ind.o1
ai=80
province_manpower=2.4
bonus_duration=8
bonus_max_morale=7
option_end
option_btn
name=texrep_ind.o2
ai=20
gold=150
option_end
""",
    "calrep_bear": """
id=calrep_bear
title=calrep_bear.t
desc=calrep_bear.d
mission_desc=calrep_bear.m
image=bear.png
show_in_missions=true
mission_image=2
popUp=true
only_once=true
trigger_and
next_and
is_civ=calrep
next_and
year_over=1845
next_and
year_below=1851
trigger_and_end
option_btn
name=calrep_bear.o1
ai=60
province_manpower=1.2
legacy=25
option_end
option_btn
name=calrep_bear.o2
ai=40
gold=100
option_end
""",
    "liberi_land": """
id=liberi_land
title=liberi_land.t
desc=liberi_land.d
mission_desc=liberi_land.m
image=landing.png
show_in_missions=true
mission_image=0
popUp=true
only_once=true
trigger_and
next_and
is_civ=liberi
next_and
year_over=1820
next_and
year_below=1848
trigger_and_end
option_btn
name=liberi_land.o1
ai=70
legacy=30
bonus_duration=20
bonus_monthly_income=5
option_end
option_btn
name=liberi_land.o2
ai=30
province_manpower=1.3
option_end
""",
    "cubrep_junta": """
id=cubrep_junta
title=cubrep_junta.t
desc=cubrep_junta.d
mission_desc=cubrep_junta.m
image=rise.png
show_in_missions=true
mission_image=2
popUp=true
only_once=true
trigger_and
next_and
is_civ=cubrep
next_and
year_over=1867
next_and
year_below=1899
trigger_and_end
option_btn
name=cubrep_junta.o1
ai=75
province_manpower=1.8
bonus_duration=10
bonus_max_morale=6
option_end
option_btn
name=cubrep_junta.o2
ai=25
gold=120
legacy=20
option_end
""",
}


def write_data() -> None:
    write(
        MOD / "mod.txt",
        """{
	Name: "Crowns of the Atlantic",
	Description: "Sixteen Atlantic civilizations, their flags, and a chain of charter, revolt, and congress events.",
	Tags: [ "Scenario", "Mod", "Events" ],
	ChangeNote: "First release. Civilizations, flags, translations, and event scripts.",
}
""",
    )
    write(
        MOD / "INSTALL.txt",
        """Crowns of the Atlantic
Age of History II: Definitive Edition

1. Copy this whole folder into the game's mods directory, so the game sees:
   mods/CrownsOfTheAtlantic/mod.txt

2. Enable the mod from the in-game mod list.

3. The civilization files live in game/civilizations/. If a new tag does not
   show in the editor, append every line from reference/register.txt to the
   base game's game/Civilizations.txt. Do not replace that file.
   This mod does not ship Civilizations.txt, because a mod copy would
   replace the full vanilla list.

4. In the scenario editor, or with Add Civilization before the game starts,
   give one of the new tags some provinces. Events look at the year and the
   tag, so set the start year inside the window named in INSTALL notes below.

5. If an event shows its key (atl_charter.t) instead of the sentence, reselect
   your language in the settings. That reloads Bundle.properties.

Play as a chartered colony (North Carolina, South Carolina, Virginia,
New England, New France, Louisiana, Acadia, Florida) from 1607 to 1779 to
start the charter chain. The chain needs the previous event, then enough
provinces or gold for the later steps.

National events: Ayiti or Saint-Domingue 1791-1805, Rio de la Plata 1809-1816,
Gran Colombia 1819-1830, Texas 1836-1845, California 1846-1850, Liberia
1821-1847, Cuba 1868-1898. The congress seat event covers the independent
states from 1816 to 1847.

ReligionID in each civilization file is 0, the first religion in the game.
Change it if you want a different religion from game/Religions.json.

Do not delete id.txt if the game creates one when you publish to the Workshop.
""",
    )
    reg = "\n".join(tag + ";" for tag, *_ in CIVS) + "\n"
    write(
        MOD / "reference" / "register.txt",
        "# Append these lines to the base game's game/Civilizations.txt.\n"
        "# Do not ship them as a replacement Civilizations.txt.\n"
        + reg,
    )
    for tag, r, g, b, wiki, _name in CIVS:
        write(
            MOD / "game" / "civilizations" / f"{tag}.json",
            "{\n"
            f'"Tag": "{tag}",\n'
            f'"iR": {r},\n'
            f'"iG": {g},\n'
            f'"iB": {b},\n'
            '"ReligionID": 0,\n'
            f'"Wiki": "{wiki}"\n'
            "}\n",
        )
    bundles = {
        "Bundle.properties": (EN, "English"),
        "Bundle_es.properties": (ES, "Spanish"),
        "Bundle_fr.properties": (FR, "French"),
        "Bundle_de.properties": (DE, "German"),
        "Bundle_pl.properties": (PL, "Polish"),
    }
    for filename, (entries, language) in bundles.items():
        write(MOD / "languages" / filename, properties(entries, f"Crowns of the Atlantic, {language}"))
    for name, body in EVENTS.items():
        write(MOD / "game" / "events" / "common" / f"{name}.txt", event(body))
    write(
        MOD / "reference" / "governments-to-paste.txt",
        """Paste these objects into a copy of the game's game/Governments.json,
then save that full file as:

mods/CrownsOfTheAtlantic/game/Governments.json

The game loads Governments.json from the mod in place of the vanilla file.
A partial file would remove the vanilla governments, so this folder does not
ship Governments.json. Extra_Tag must stay unique. If the game already uses
xa, xb, or xc, change them. AVAILABLE_SINCE_AGE_ID 0 makes them available
from the first age. Raise it after you check game ages if you want them later.

		{
			Name: "ColonialAssembly",
			Extra_Tag: "xa",
			GOV_GROUP_ID: 0,
			RulerTitle: Governor,
			RulerRoman: false,
			KingsImages: false,
			Color: [20, 62, 120],
			AVAILABLE_SINCE_AGE_ID: 0,
			REVOLUTIONISTS: false,
			AdvisorCost: -0.02,
			MonthlyLegacy: 0.2,
			MaxManpower: 800,
		},
		{
			Name: "RevolutionaryRepublic",
			Extra_Tag: "xb",
			GOV_GROUP_ID: 1,
			RulerTitle: President,
			RulerRoman: false,
			KingsImages: false,
			Color: [176, 32, 40],
			AVAILABLE_SINCE_AGE_ID: 0,
			REVOLUTIONISTS: true,
			AdvisorCost: 0.02,
			MonthlyLegacy: 0.45,
			MaxManpower: 1400,
		},
		{
			Name: "LiberatedState",
			Extra_Tag: "xc",
			GOV_GROUP_ID: 1,
			RulerTitle: President,
			RulerRoman: false,
			KingsImages: false,
			Color: [214, 168, 0],
			AVAILABLE_SINCE_AGE_ID: 0,
			REVOLUTIONISTS: true,
			AdvisorCost: 0,
			MonthlyLegacy: 0.3,
			MaxManpower: 1100,
		},
""",
    )


# ---------------------------------------------------------------------------
# Art
# ---------------------------------------------------------------------------

class Flag:
    def __init__(self, w: int = 462, h: int = 300):
        self.w = w
        self.h = h
        self.im = Image.new("RGB", (w, h), WHITE)
        self.d = ImageDraw.Draw(self.im)

    def px(self, x: float, y: float) -> tuple[float, float]:
        return x * self.w, y * self.h

    def rect(self, x: float, y: float, x2: float, y2: float, color: tuple[int, int, int]) -> None:
        self.d.rectangle((x * self.w, y * self.h, x2 * self.w - 1, y2 * self.h - 1), fill=color)

    def poly(self, pts: list[tuple[float, float]], color: tuple[int, int, int]) -> None:
        self.d.polygon([self.px(x, y) for x, y in pts], fill=color)

    def star(self, cx: float, cy: float, r: float, color: tuple[int, int, int], points: int = 5) -> None:
        radius = r * min(self.w, self.h)
        inner = radius * 0.42
        coords = []
        for i in range(points * 2):
            ang = -math.pi / 2 + i * math.pi / points
            rad = radius if i % 2 == 0 else inner
            coords.append((cx * self.w + rad * math.cos(ang), cy * self.h + rad * math.sin(ang)))
        self.d.polygon(coords, fill=color)

    def sun(self, cx: float, cy: float, r: float, color: tuple[int, int, int]) -> None:
        radius = r * min(self.w, self.h)
        for i in range(16):
            ang = i * math.pi / 8
            self.d.line(
                (
                    cx * self.w + math.cos(ang) * radius * 0.72,
                    cy * self.h + math.sin(ang) * radius * 0.72,
                    cx * self.w + math.cos(ang) * radius * 1.45,
                    cy * self.h + math.sin(ang) * radius * 1.45,
                ),
                fill=color,
                width=max(2, self.w // 120),
            )
        box = (
            cx * self.w - radius,
            cy * self.h - radius,
            cx * self.w + radius,
            cy * self.h + radius,
        )
        self.d.ellipse(box, fill=color)
        inner = radius * 0.45
        self.d.ellipse(
            (cx * self.w - inner, cy * self.h - inner, cx * self.w + inner, cy * self.h + inner),
            fill=(255, 214, 90),
        )

    def crescent(self, cx: float, cy: float, r: float, color: tuple[int, int, int], field: tuple[int, int, int]) -> None:
        radius = r * min(self.w, self.h)
        self.d.ellipse(
            (cx * self.w - radius, cy * self.h - radius, cx * self.w + radius, cy * self.h + radius),
            fill=color,
        )
        shift = radius * 0.42
        self.d.ellipse(
            (
                cx * self.w - radius + shift,
                cy * self.h - radius * 0.95,
                cx * self.w + radius + shift,
                cy * self.h + radius * 1.05,
            ),
            fill=field,
        )

    def pine(self, cx: float, cy: float, h: float) -> None:
        height = h * self.h
        x = cx * self.w
        top = cy * self.h
        green = (18, 110, 52)
        trunk = (92, 58, 28)
        layers = [
            (0.0, 0.34, 0.16),
            (0.28, 0.62, 0.24),
            (0.52, 0.86, 0.32),
        ]
        for y0, y1, half in layers:
            self.d.polygon(
                [
                    (x, top + height * y0),
                    (x - height * half, top + height * y1),
                    (x + height * half, top + height * y1),
                ],
                fill=green,
            )
        self.d.rectangle(
            (x - height * 0.045, top + height * 0.82, x + height * 0.045, top + height),
            fill=trunk,
        )

    def palmetto(self, cx: float, cy: float) -> None:
        x = cx * self.w
        y = cy * self.h
        scale = self.h / 300
        green = (22, 120, 58)
        dark = (12, 78, 40)
        trunk = (236, 230, 214)
        origin_y = y - 8 * scale
        for index, deg in enumerate(range(-72, 76, 8)):
            ang = math.radians(deg - 90)
            length = 92 * scale
            half = 7 * scale
            tip_x = x + math.cos(ang) * length
            tip_y = origin_y + math.sin(ang) * length * 0.72
            side_x = -math.sin(ang) * half
            side_y = math.cos(ang) * half
            self.d.polygon(
                [(x, origin_y + 6 * scale), (tip_x + side_x, tip_y + side_y), (tip_x - side_x, tip_y - side_y)],
                fill=green if index % 2 == 0 else dark,
            )
        self.d.ellipse((x - 14 * scale, origin_y - 6 * scale, x + 14 * scale, origin_y + 22 * scale), fill=green)
        self.d.rectangle((x - 7 * scale, origin_y + 8 * scale, x + 7 * scale, y + 108 * scale), fill=trunk)

    def bear(self, cx: float, cy: float) -> None:
        x = cx * self.w
        y = cy * self.h
        s = self.h / 300
        color = (84, 52, 26)
        self.d.ellipse((x + 8 * s, y + 18 * s, x + 128 * s, y + 62 * s), fill=color)
        self.d.ellipse((x + 16 * s, y + 2 * s, x + 72 * s, y + 40 * s), fill=color)
        self.d.ellipse((x + 104 * s, y + 8 * s, x + 158 * s, y + 48 * s), fill=color)
        self.d.ellipse((x + 142 * s, y + 22 * s, x + 186 * s, y + 42 * s), fill=color)
        self.d.ellipse((x + 116 * s, y - 2 * s, x + 136 * s, y + 18 * s), fill=color)
        self.d.ellipse((x - 8 * s, y + 28 * s, x + 18 * s, y + 46 * s), fill=color)
        for leg_x in (22, 48, 86, 110):
            self.d.rectangle((x + leg_x * s, y + 48 * s, x + (leg_x + 16) * s, y + 82 * s), fill=color)


def draw_ncarol(f: Flag) -> None:
    blue = (15, 55, 130)
    f.rect(0, 0, 0.38, 1, blue)
    f.rect(0.38, 0, 1, 0.5, RED)
    f.rect(0.38, 0.5, 1, 1, WHITE)
    f.star(0.19, 0.5, 0.16, WHITE)


def draw_scarol(f: Flag) -> None:
    blue = (0, 48, 112)
    f.rect(0, 0, 1, 1, blue)
    f.crescent(0.28, 0.34, 0.16, WHITE, blue)
    f.palmetto(0.56, 0.42)


def draw_virgin(f: Flag) -> None:
    blue = (12, 36, 92)
    f.rect(0, 0, 1, 1, blue)
    f.d.ellipse((0.28 * f.w, 0.12 * f.h, 0.72 * f.w, 0.88 * f.h), outline=GOLD, width=max(4, f.w // 80))
    f.star(0.5, 0.5, 0.16, WHITE)


def draw_neweng(f: Flag) -> None:
    f.rect(0, 0, 1, 1, (176, 28, 36))
    f.rect(0, 0, 0.46, 0.58, WHITE)
    f.pine(0.23, 0.08, 0.46)


def draw_acadia(f: Flag) -> None:
    f.rect(0, 0, 1 / 3, 1, (0, 48, 135))
    f.rect(1 / 3, 0, 2 / 3, 1, WHITE)
    f.rect(2 / 3, 0, 1, 1, (196, 22, 48))
    f.star(0.5, 0.5, 0.14, GOLD)


def draw_newfrn(f: Flag) -> None:
    f.rect(0, 0, 1, 1, (245, 242, 230))
    f.d.rectangle((8, 8, f.w - 9, f.h - 9), outline=(20, 48, 120), width=max(8, f.w // 40))
    for cx, cy in ((0.3, 0.5), (0.5, 0.34), (0.7, 0.5)):
        f.poly([(cx, cy - 0.12), (cx + 0.045, cy), (cx, cy + 0.12), (cx - 0.045, cy)], GOLD)


def draw_louisn(f: Flag) -> None:
    f.rect(0, 0, 1, 1, (16, 72, 64))
    f.rect(0.38, 0, 0.62, 1, (245, 242, 230))
    for cy in (0.28, 0.5, 0.72):
        f.poly([(0.5, cy - 0.08), (0.545, cy), (0.5, cy + 0.08), (0.455, cy)], GOLD)


def draw_ayiti(f: Flag) -> None:
    f.rect(0, 0, 1, 0.5, (0, 56, 168))
    f.rect(0, 0.5, 1, 1, (210, 16, 46))


def draw_stdomi(f: Flag) -> None:
    f.rect(0, 0, 1, 1, (245, 242, 230))
    f.rect(0, 0, 0.16, 1, (0, 48, 135))
    f.rect(0.84, 0, 1, 1, (196, 22, 48))
    f.d.rectangle((0.16 * f.w, 0, 0.84 * f.w - 1, f.h - 1), outline=GOLD, width=max(3, f.w // 100))


def draw_riopla(f: Flag) -> None:
    band = (116, 172, 214)
    f.rect(0, 0, 1, 1 / 3, band)
    f.rect(0, 1 / 3, 1, 2 / 3, WHITE)
    f.rect(0, 2 / 3, 1, 1, band)
    f.sun(0.5, 0.5, 0.12, GOLD)


def draw_grncol(f: Flag) -> None:
    f.rect(0, 0, 1, 0.5, (252, 209, 22))
    f.rect(0, 0.5, 1, 0.75, (0, 48, 135))
    f.rect(0, 0.75, 1, 1, (206, 17, 38))


def draw_texrep(f: Flag) -> None:
    f.rect(0, 0, 0.33, 1, (0, 40, 104))
    f.rect(0.33, 0, 1, 0.5, WHITE)
    f.rect(0.33, 0.5, 1, 1, (191, 26, 38))
    f.star(0.165, 0.5, 0.12, WHITE)


def draw_calrep(f: Flag) -> None:
    f.rect(0, 0, 1, 1, WHITE)
    f.rect(0, 0.82, 1, 1, (176, 32, 36))
    f.star(0.16, 0.24, 0.1, (176, 32, 36))
    f.bear(0.28, 0.38)


def draw_liberi(f: Flag) -> None:
    for i in range(11):
        color = (191, 10, 48) if i % 2 == 0 else WHITE
        f.rect(0, i / 11, 1, (i + 1) / 11, color)
    f.rect(0, 0, 0.42, 5 / 11, (0, 32, 96))
    f.star(0.21, 2.5 / 11, 0.1, WHITE)


def draw_florid(f: Flag) -> None:
    f.rect(0, 0, 1, 0.28, (170, 21, 27))
    f.rect(0, 0.28, 1, 0.72, (245, 196, 0))
    f.rect(0, 0.72, 1, 1, (170, 21, 27))


def draw_cubrep(f: Flag) -> None:
    blue = (0, 42, 143)
    for i, color in enumerate((blue, WHITE, blue, WHITE, blue)):
        f.rect(0, i / 5, 1, (i + 1) / 5, color)
    f.poly([(0, 0), (0.46, 0.5), (0, 1)], (206, 17, 38))
    f.star(0.17, 0.5, 0.1, WHITE)


DRAWERS = {
    "ncarol": draw_ncarol,
    "scarol": draw_scarol,
    "virgin": draw_virgin,
    "neweng": draw_neweng,
    "acadia": draw_acadia,
    "newfrn": draw_newfrn,
    "louisn": draw_louisn,
    "ayiti": draw_ayiti,
    "stdomi": draw_stdomi,
    "riopla": draw_riopla,
    "grncol": draw_grncol,
    "texrep": draw_texrep,
    "calrep": draw_calrep,
    "liberi": draw_liberi,
    "florid": draw_florid,
    "cubrep": draw_cubrep,
}


def save_flags() -> None:
    sizes = {
        MOD / "gfx" / "flagsXH": (154, 100),
        MOD / "game" / "flagsH": (154, 100),
        MOD / "game" / "flags": (68, 44),
    }
    for tag, drawer in DRAWERS.items():
        master = Flag()
        drawer(master)
        for folder, size in sizes.items():
            folder.mkdir(parents=True, exist_ok=True)
            image = master.im.resize(size, Image.Resampling.LANCZOS)
            image.save(folder / f"{tag}.png")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_logo() -> None:
    w, h = 640, 360
    im = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(im)
    d.rectangle((16, 16, w - 17, h - 17), outline=GOLD, width=3)
    d.rectangle((24, 24, w - 25, h - 25), outline=(70, 92, 120), width=1)
    # Crown
    cx, cy = 320, 118
    d.polygon([(cx - 78, cy + 28), (cx + 78, cy + 28), (cx + 70, cy + 48), (cx - 70, cy + 48)], fill=GOLD)
    peaks = [(-70, 28, -46), (-28, -18, -8), (8, -18, 28), (46, 28, 70)]
    for x0, top, x1 in ((-70, 10, -40), (-24, -36, 0), (0, -36, 24), (40, 10, 70)):
        d.polygon([(cx + x0, cy + 28), (cx + (x0 + x1) / 2, cy + top), (cx + x1, cy + 28)], fill=GOLD)
    d.ellipse((cx - 8, cy - 46, cx + 8, cy - 30), fill=GOLD)
    d.ellipse((cx - 78, cy + 2, cx - 62, cy + 18), fill=(232, 206, 120))
    d.ellipse((cx + 62, cy + 2, cx + 78, cy + 18), fill=(232, 206, 120))
    # Waves
    for i, y in enumerate((196, 214, 232)):
        color = (64, 120, 168) if i % 2 == 0 else (116, 172, 214)
        d.arc((80, y, 560, y + 36), 200, 340, fill=color, width=4)
    title = font(54, bold=True)
    sub = font(22, bold=True)
    small = font(16, bold=False)
    d.text((w / 2, 268), "CROWNS", font=title, fill=GOLD, anchor="mm")
    d.text((w / 2, 312), "OF THE ATLANTIC", font=sub, fill=WHITE, anchor="mm")
    d.text((w / 2, 338), "AGE OF HISTORY II", font=small, fill=(168, 186, 206), anchor="mm")
    im.save(MOD / "logo.png")


def event_card(name: str, bg: tuple[int, int, int], kind: str) -> None:
    w, h = 480, 270
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    d.rectangle((10, 10, w - 11, h - 11), outline=GOLD, width=4)
    f = Flag(w, h)
    f.im = im
    f.d = d
    if kind == "star":
        f.star(0.5, 0.52, 0.28, GOLD)
    elif kind == "crown":
        d.polygon([(160, 150), (320, 70), (480 - 160, 150)], fill=GOLD)
        d.rectangle((150, 150, 330, 190), fill=GOLD)
    elif kind == "scroll":
        d.rounded_rectangle((140, 60, 340, 210), radius=18, fill=(245, 236, 214))
        d.rectangle((160, 88, 320, 96), fill=NAVY)
        d.rectangle((160, 112, 300, 120), fill=NAVY)
        d.rectangle((160, 136, 310, 144), fill=NAVY)
    elif kind == "flame":
        d.polygon([(240, 48), (300, 150), (250, 140), (270, 210), (180, 120), (220, 130)], fill=(255, 186, 64))
        d.polygon([(240, 90), (270, 150), (230, 150), (210, 130)], fill=(255, 92, 40))
    elif kind == "sun":
        f.sun(0.5, 0.52, 0.22, GOLD)
    elif kind == "bear":
        f.rect(0, 0.78, 1, 1, (176, 32, 36))
        f.bear(0.32, 0.36)
        f.star(0.22, 0.28, 0.1, (176, 32, 36))
    elif kind == "wave":
        for i, y in enumerate((90, 130, 170)):
            d.arc((60, y, 420, y + 50), 200, 340, fill=WHITE, width=6)
    else:
        f.star(0.5, 0.52, 0.22, WHITE)
    out = MOD / "game" / "events" / "images" / "H" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)


def save_event_art() -> None:
    cards = [
        ("charter.png", (20, 48, 96), "scroll"),
        ("assembly.png", (28, 42, 78), "crown"),
        ("crisis.png", (92, 24, 28), "flame"),
        ("declare.png", (24, 36, 84), "star"),
        ("constit.png", (36, 58, 48), "scroll"),
        ("congress.png", (18, 52, 92), "sun"),
        ("recog.png", (48, 42, 28), "crown"),
        ("rise.png", (110, 28, 24), "flame"),
        ("republic.png", (0, 48, 120), "star"),
        ("cabildo.png", (28, 78, 120), "sun"),
        ("angostura.png", (120, 90, 16), "crown"),
        ("bear.png", (236, 232, 220), "bear"),
        ("landing.png", (16, 64, 96), "wave"),
    ]
    for name, bg, kind in cards:
        event_card(name, bg, kind)


def main() -> None:
    write_data()
    save_flags()
    draw_logo()
    save_event_art()
    print(f"Wrote {MOD}")


if __name__ == "__main__":
    main()
