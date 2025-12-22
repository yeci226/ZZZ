import chalk from "chalk";

// Logger
class Logger {
  origin: string;

  constructor(origin: string) {
    this.origin = origin;
  }
  info(message: string) {
    console.log(
      `${chalk.gray(new Date().toLocaleString())} ${chalk.cyan(
        `[${this.origin}]`
      )} ${message}`
    );
  }
  command(message: string) {
    console.log(
      `${chalk.gray(new Date().toLocaleString())} ${chalk.hex("#F3CCF3")(
        `[${this.origin}]`
      )} ${message}`
    );
  }
  success(message: string) {
    console.log(
      `${chalk.gray(new Date().toLocaleString())} ${chalk.green(
        `[${this.origin}]`
      )} ${message}`
    );
  }
  warn(message: string) {
    console.warn(
      `${chalk.gray(new Date().toLocaleString())} ${chalk.yellow(
        `[${this.origin}]`
      )} ${message}`
    );
  }
  error(message: string) {
    console.error(
      `${chalk.gray(new Date().toLocaleString())} ${chalk.red(
        `[${this.origin}]`
      )} ${message}`
    );
  }
}

export default Logger;
