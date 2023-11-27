import { promises as fsPromises } from "fs";
import moment, { Moment } from "moment-timezone";
import path from "path";


function autoDeleteLogFilesAfter24Hours() {
    fsPromises.readdir("./util/logs/").then((files: string[]) => {
        files.forEach((file: string) => {
            if (path.extname(file) === ".log" && path.basename(file).includes("new_request") && moment().diff(moment(file.split("_")[0], "YYYYMMDDHHmm").add(24, "hours")) > 0) {
                fsPromises.unlink(`./util/logs/${file}`)
            }
        });
    });
}

autoDeleteLogFilesAfter24Hours();