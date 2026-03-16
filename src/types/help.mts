export interface HelpItemParam {
  param: string;
  required: boolean;
  descr: string;
}

export interface HelpItem {
  command: string;
  descr: string;
  params?: HelpItemParam[];
}

export interface HelpRegistration {
  from: string;
  help: HelpItem[];
}

export interface RegisteredHelp {
  from: string;
  help: HelpItem[];
}
