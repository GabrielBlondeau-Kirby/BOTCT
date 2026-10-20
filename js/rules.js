// Livret de règles rapide, pour le Conteur.
const RULES = [
  {
    title: "Le but du jeu",
    html: `
      <p>Deux équipes s'affrontent en secret.</p>
      <ul>
        <li><b class="good">Le Bien</b> (Villageois et Étrangers) gagne si <b>le Démon meurt</b>.</li>
        <li><b class="evil">Le Mal</b> (Sbires et Démon) gagne s'il ne reste que <b>2 joueurs vivants</b> (Voyageurs exclus).</li>
      </ul>
      <p>Certains personnages modifient ces conditions (Sainte, Maire, Jumeau maléfique, Vortox, Maladroit…).</p>`,
  },
  {
    title: "Mise en place",
    html: `
      <ol>
        <li>Choisissez le script et préparez les jetons selon le nombre de joueurs (voir tableau ci-dessous).</li>
        <li>Appliquez les modificateurs entre crochets, ex. <i>[+2 Étrangers]</i> du Baron : retirez autant de Villageois.</li>
        <li>Mettez les jetons dans le sac, chaque joueur en pioche un en secret puis vous le rend.</li>
        <li>Remplissez le Grimoire : placez chaque personnage devant le bon joueur, ajoutez les rappels de mise en place (Ivrogne, leurre de la Diseuse…).</li>
        <li>L'Ivrogne pioche un jeton de Villageois : vous savez qu'il est l'Ivrogne, lui non.</li>
      </ol>
      <table class="dist">
        <thead><tr><th>Joueurs</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15+</th></tr></thead>
        <tbody>
          <tr><th class="t-townsfolk">Villageois</th><td>3</td><td>3</td><td>5</td><td>5</td><td>5</td><td>7</td><td>7</td><td>7</td><td>9</td><td>9</td><td>9</td></tr>
          <tr><th class="t-outsider">Étrangers</th><td>0</td><td>1</td><td>0</td><td>1</td><td>2</td><td>0</td><td>1</td><td>2</td><td>0</td><td>1</td><td>2</td></tr>
          <tr><th class="t-minion">Sbires</th><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>2</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td></tr>
          <tr><th class="t-demon">Démon</th><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td></tr>
        </tbody>
      </table>`,
  },
  {
    title: "Déroulement d'un tour",
    html: `
      <p><b>Nuit → Jour → Nuit…</b> La partie commence par la première nuit.</p>
      <h4>La nuit</h4>
      <ul>
        <li>Tout le monde ferme les yeux. Suivez l'<b>ordre de nuit</b> : réveillez chaque personnage concerné, il agit par gestes, puis se rendort.</li>
        <li>Première nuit (7 joueurs et plus) : les Sbires apprennent qui est le Démon, le Démon apprend ses Sbires et 3 bluffs.</li>
        <li>À l'aube, annoncez qui est mort, sans dire comment.</li>
      </ul>
      <h4>Le jour</h4>
      <ul>
        <li>Discussions libres, en public ou en aparté.</li>
        <li>Puis les <b>nominations</b> : chaque joueur vivant peut nominer une fois par jour, et chaque joueur ne peut être nominé qu'une fois par jour.</li>
      </ul>`,
  },
  {
    title: "Nominations, votes et exécution",
    html: `
      <ul>
        <li>Le nominateur explique son choix, le nominé se défend.</li>
        <li>Le vote fait le tour du cercle dans le sens horaire, en finissant par le nominé. Main levée = pour.</li>
        <li>Il faut au moins <b>la moitié des joueurs vivants</b> (arrondie au supérieur) pour mettre le nominé « sur le billot ».</li>
        <li>Un nouveau nominé le remplace seulement s'il obtient <b>strictement plus</b> de votes. À égalité, personne n'est sur le billot.</li>
        <li>En fin de journée, le joueur sur le billot est <b>exécuté</b>. Une seule exécution par jour.</li>
      </ul>`,
  },
  {
    title: "Les morts",
    html: `
      <ul>
        <li>Un joueur mort révèle seulement qu'il est mort, pas son personnage.</li>
        <li>Il perd sa capacité, ne peut plus nominer, mais <b>continue de parler</b> et son équipe peut toujours gagner.</li>
        <li>Il garde <b>un seul vote fantôme</b> pour le reste de la partie (retournez son jeton de linceul quand il l'utilise).</li>
      </ul>`,
  },
  {
    title: "Ivre et empoisonné",
    html: `
      <ul>
        <li>Un joueur <b>ivre</b> ou <b>empoisonné</b> n'a plus de capacité, mais <b>ne le sait pas</b>.</li>
        <li>Vous faites comme si sa capacité fonctionnait : vous pouvez lui donner de <b>fausses informations</b>.</li>
        <li>Ses capacités passives (Soldat, Sainte…) ne fonctionnent plus.</li>
      </ul>`,
  },
  {
    title: "Voyageurs",
    html: `
      <ul>
        <li>Un joueur arrivant en cours ou partant tôt peut jouer un Voyageur. Son personnage est <b>public</b>, son alignement est choisi par le Conteur (secret).</li>
        <li>Les Voyageurs ne comptent pas dans la répartition ni pour la condition de victoire du Mal.</li>
        <li>Un Voyageur peut être <b>exilé</b> : n'importe qui (même mort) peut le nominer, tout le monde vote, il faut la moitié des joueurs (vivants et morts). L'exil n'est pas une exécution.</li>
      </ul>`,
  },
  {
    title: "Glossaire",
    html: `
      <dl>
        <dt>Alignement</dt><dd>Bon ou Mauvais.</dd>
        <dt>*</dt><dd>« Sauf la première nuit ».</dd>
        <dt>Détecté comme</dt><dd>Le personnage peut apparaître comme autre chose aux capacités (Reclus, Espion).</dd>
        <dt>Fou de…</dt><dd>Le joueur doit essayer de convaincre le groupe qu'il est ce personnage.</dd>
        <dt>Protégé</dt><dd>Ne peut pas mourir à cause du Démon (selon la capacité).</dd>
        <dt>Bluffs</dt><dd>3 personnages Bons non en jeu montrés au Démon pour se faire passer pour eux.</dd>
        <dt>Leurre</dt><dd>Joueur Bon détecté comme Démon par la Diseuse de bonne aventure.</dd>
      </dl>`,
  },
  {
    title: "Conseils de Conteur",
    html: `
      <ul>
        <li>Votre but : une partie serrée et amusante. Aidez l'équipe qui est en retard via les informations que vous choisissez.</li>
        <li>Gardez le Grimoire à jour à chaque action, surtout les rappels « Ivre » et « Empoisonné ».</li>
        <li>Pour une première partie, évitez Ivrogne, Espion et Reclus ensemble : trop de fausses pistes.</li>
        <li>Rappelez régulièrement le nombre de votes nécessaires pour une exécution.</li>
        <li>En cas de doute sur une règle, tranchez dans le sens qui rend la partie la plus intéressante.</li>
      </ul>`,
  },
];
