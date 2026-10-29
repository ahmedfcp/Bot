// واجهة قديمة للصور — صارت تعتمد على cmdmedia.js
import * as M from "./cmdmedia.js";

export const linkImage = (command, buffer) => M.link("image", command, buffer);
export const unlinkImage = (command) => M.unlink("image", command);
export const getImagePath = (command) => M.getPath("image", command);
export const listLinked = () => M.list("image");
