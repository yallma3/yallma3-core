import type { Workflow } from "../../Models/Workflow";
import { executeFlowRuntime } from "../runtime";

const example: Workflow = {
  nodes: [
    {
      id: 1,
      title: "Text",
      nodeValue: "Text input",
      nodeType: "Text",
      sockets: [
        {
          id: 101,
          title: "Input",
          type: "input",
          nodeId: 1,
          dataType: "string",
        },
        {
          id: 102,
          title: "Output",
          type: "output",
          nodeId: 1,
          dataType: "string",
        },
      ],
      x: 88,
      y: 309,
      width: 380,
      height: 220,
      selected: false,
      processing: false,
      configParameters: [
        {
          parameterName: "Text Input",
          parameterType: "text",
          defaultValue: "{{input}}",
          valueSource: "UserInput",
          UIConfigurable: true,
          description: "Text template to interpolate with input",
          isNodeBodyContent: true,
          i18n: {
            en: {
              "Text Input": {
                Name: "Text Input",
                Description: "Text template to interpolate with input",
              },
            },
            ar: {
              "Text Input": {
                Name: "القالب النصي",
                Description: "قالب نصي يُدمج مع البيانات المُدخلة",
              },
            },
          },
          paramValue: "Text input",
        },
      ],
      result: "Text input",
    },
    {
      id: 2,
      title: "Text",
      nodeValue: "Part one: {{input}}",
      nodeType: "Text",
      sockets: [
        {
          id: 201,
          title: "Input",
          type: "input",
          nodeId: 2,
          dataType: "string",
        },
        {
          id: 202,
          title: "Output",
          type: "output",
          nodeId: 2,
          dataType: "string",
        },
      ],
      x: 664,
      y: 83,
      width: 380,
      height: 220,
      selected: false,
      processing: false,
      configParameters: [
        {
          parameterName: "Text Input",
          parameterType: "text",
          defaultValue: "{{input}}",
          valueSource: "UserInput",
          UIConfigurable: true,
          description: "Text template to interpolate with input",
          isNodeBodyContent: true,
          i18n: {
            en: {
              "Text Input": {
                Name: "Text Input",
                Description: "Text template to interpolate with input",
              },
            },
            ar: {
              "Text Input": {
                Name: "القالب النصي",
                Description: "قالب نصي يُدمج مع البيانات المُدخلة",
              },
            },
          },
          paramValue: "Part one: {{input}}",
        },
      ],
      result: "Part one: Text input",
    },
    {
      id: 3,
      title: "Text",
      nodeValue: "Part two {{input}}",
      nodeType: "Text",
      sockets: [
        {
          id: 301,
          title: "Input",
          type: "input",
          nodeId: 3,
          dataType: "string",
        },
        {
          id: 302,
          title: "Output",
          type: "output",
          nodeId: 3,
          dataType: "string",
        },
      ],
      x: 652,
      y: 469.25,
      width: 380,
      height: 220,
      selected: false,
      processing: false,
      configParameters: [
        {
          parameterName: "Text Input",
          parameterType: "text",
          defaultValue: "{{input}}",
          valueSource: "UserInput",
          UIConfigurable: true,
          description: "Text template to interpolate with input",
          isNodeBodyContent: true,
          i18n: {
            en: {
              "Text Input": {
                Name: "Text Input",
                Description: "Text template to interpolate with input",
              },
            },
            ar: {
              "Text Input": {
                Name: "القالب النصي",
                Description: "قالب نصي يُدمج مع البيانات المُدخلة",
              },
            },
          },
          paramValue: "Part two {{input}}",
        },
      ],
      result: "Part two Text input",
    },
    {
      id: 5,
      title: "Join",
      nodeValue: " //// ",
      nodeType: "Join",
      sockets: [
        {
          id: 501,
          title: "Input 1",
          type: "input",
          nodeId: 5,
          dataType: "unknown",
        },
        {
          id: 502,
          title: "Input 2",
          type: "input",
          nodeId: 5,
          dataType: "unknown",
        },
        {
          id: 611,
          title: "Output",
          type: "output",
          nodeId: 5,
          dataType: "string",
        },
      ],
      x: 1347.3238734090128,
      y: 249.41245270037848,
      width: 240,
      height: 230,
      selected: false,
      processing: false,
      configParameters: [
        {
          parameterName: "Separator",
          parameterType: "text",
          defaultValue: " ",
          valueSource: "UserInput",
          UIConfigurable: true,
          description: "Separator to join the inputs",
          isNodeBodyContent: true,
          i18n: {
            en: {
              Separator: {
                Name: "Separator",
                Description: "Separator to join the inputs",
              },
            },
            ar: {
              Separator: {
                Name: "الفاصلة",
                Description: "فاصلة للدمج بين المدخلات",
              },
            },
          },
          paramValue: " //// ",
        },
      ],
      result: "Part one: Text input //// Part two Text input",
    },
    {
      id: 6,
      title: "Text",
      nodeValue: "{{input}}",
      nodeType: "Text",
      sockets: [
        {
          id: 601,
          title: "Input",
          type: "input",
          nodeId: 6,
          dataType: "string",
        },
        {
          id: 602,
          title: "Output",
          type: "output",
          nodeId: 6,
          dataType: "string",
        },
      ],
      x: 1848.3815657167054,
      y: 251.1432219311476,
      width: 380,
      height: 220,
      selected: false,
      processing: false,
      configParameters: [
        {
          parameterName: "Text Input",
          parameterType: "text",
          defaultValue: "{{input}}",
          valueSource: "UserInput",
          UIConfigurable: true,
          description: "Text template to interpolate with input",
          isNodeBodyContent: true,
          i18n: {
            en: {
              "Text Input": {
                Name: "Text Input",
                Description: "Text template to interpolate with input",
              },
            },
            ar: {
              "Text Input": {
                Name: "القالب النصي",
                Description: "قالب نصي يُدمج مع البيانات المُدخلة",
              },
            },
          },
        },
      ],
      result: "Part one: Text input //// Part two Text input",
    },
  ],
  connections: [
    {
      fromSocket: 102,
      toSocket: 201,
    },
    {
      fromSocket: 102,
      toSocket: 301,
    },
    {
      fromSocket: 202,
      toSocket: 501,
    },
    {
      fromSocket: 302,
      toSocket: 502,
    },
    {
      fromSocket: 611,
      toSocket: 601,
    },
  ],
  id: "123",
  name: "test",
  description: "desc",
};

export const testWorkflowRuntime = async () => {
  const results = executeFlowRuntime(example);
  console.log(results);
};
