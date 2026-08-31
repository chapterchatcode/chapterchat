/* A small original multi-chapter text used ONLY by the headless smoke test.
   Paragraph counts are exact and known, so the test can assert on them:
     Chapter One   5 paragraphs
     Chapter Two   4
     Chapter Three 4
     Chapter Four  3
   Never bundled, never shipped. */
import { writeFileSync } from "node:fs";

const CHAPTERS = [
  ["Chapter One", [
    "The tide had gone out further than anyone remembered, and the boats lay tilted on the mud like things that had given up. Mira walked the length of the harbour wall without meeting anyone, which was the point of walking it at that hour.",
    "Her father had kept the light for thirty-one years and had never once, he said, found the sea boring. She had believed him then. She was less sure now, standing where he used to stand, waiting for something to happen to the water.",
    "\"You're up early,\" said Tomas, who had appeared beside her with the particular quietness of a man in soft boots.",
    "They stood together and watched the grey line where the estuary let go of the land. Somewhere behind them a gull argued with another gull about nothing at all.",
    "By the time the sun cleared the sea wall she had decided nothing, which was itself a kind of decision, and she went home to put the kettle on.",
  ]],
  ["Chapter Two", [
    "The letter had arrived on a Tuesday, which Mira thought was a cowardly day for a letter to arrive. It said very little. It said the house would be sold, that the sale had already been agreed, and that she might wish to collect anything of sentimental value before the end of the month.",
    "Sentimental value. She had read the phrase four times and each time it had got smaller.",
    "The morning went on, as mornings do, indifferent to the post. The kettle boiled. The window fogged. The cat, who belonged to nobody and therefore to everyone on the row, arrived for its share of the milk and left without thanks.",
    "By noon the wind had turned and the harbour smelled of iron. She put on her father's coat, which still did not fit her, and went out to see about the boat.",
  ]],
  ["Chapter Three", [
    "There were three things she knew how to do properly, and two of them involved rope. The third she had learned from her mother and had not used since the funeral, when she had stood at the front of a cold church and sung the descant alone because nobody else could hold it.",
    "The boat was worse than she had hoped and better than Tomas had predicted, which put it roughly where she had expected it to be.",
    "She spent the afternoon on her back beneath the hull, and when she came out the light had gone amber and the whole town looked briefly like somewhere worth staying.",
    "\"You'll not get her out before spring,\" Tomas said, from the wall. \"I'm not trying to get her out,\" said Mira. \"I'm trying to stop her sinking where she sits.\"",
  ]],
  ["Chapter Four", [
    "It rained for nine days. On the tenth, a man from the bank came down the hill in shoes entirely wrong for the hill, and Mira watched him from the window with a cup of tea going cold in her hands.",
    "In the end it was the light that decided her, as it had decided most things in her life. She climbed the tower on a clear night in October with a flask and a blanket, and she sat where her father had sat, and she watched the beam go round.",
    "It did not need her. That is the thing nobody tells you about a lighthouse. It goes round because it goes round. She stayed until the sky went the colour of a struck match, and then she came down, and she wrote to the bank, and she named a price.",
  ]],
];

const out = [];
for (const [title, paras] of CHAPTERS) {
  out.push(title);
  out.push(...paras);
}
writeFileSync("/tmp/the-lighthouse-keeper.txt", out.join("\n\n"), "utf8");
console.log("fixture written:", CHAPTERS.map(([t, p]) => `${t}=${p.length}`).join(", "));
