import { Config } from "@remotion/cli/config";

// Рендер через установленный Google Chrome, без отдельной загрузки браузера
Config.setBrowserExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setConcurrency(6);
