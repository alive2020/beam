// reformat results to json type
import fs from 'fs';
import { Storage } from '@google-cloud/storage';

// import data from './testresults.json';

const argv = process.argv;

const gcs = new Storage({
  projectId: 'apache-beam-testing',
  keyFilename:
    '.test-infra/validate-runner/src/main/js/apache-beam-testing-keys.json',
});

const bucket = gcs.bucket('beam-validates-runner-info');

// no input or output files
if (argv.length <= 2) {
  console.log('ERROR: Please provide input and output files');
  process.exit();
}

const inputFile = argv[2];

// read input file into data
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const statusDescription = {
  yes: 'Yes',
  yesSupported: 'fully supported',
  partially: 'Partially',
  partiallySupported: 'fully supported in batch mode',
  no: 'No',
  notImplemented: 'not implemeted',
  notSupported: 'Not supported',
};

const validatesRunner = 'org.apache.beam.sdk.testing.ValidatesRunner';

// shuffle and format into categories with values of tests and results
let categoriesWithTests = {};
let classes = [];
Object.keys(data.batch).forEach((key, i) => {
  classes.push(key);

  let curr = [];
  let dir = {};
  let counts = 0;
  data.batch[key].testCases.forEach((test) => {
    if (test.categories.length === 0) return;
    test.categories
      .filter((item) => item !== validatesRunner)
      .forEach((cat, i) => {
        let passed = test.status === 'PASSED';
        if (categoriesWithTests[cat] === undefined) {
          let categoryName = cat.slice(cat.lastIndexOf('.') + 1);
          categoriesWithTests[cat] = {
            name: categoryName,
            values: [],
          };
        }
        if (dir[cat] === undefined) {
          dir[cat] = counts;
          counts++;

          curr.push({
            name: cat,
            values: [
              {
                class: key,
                [passed ? 'l3' : 'l4']: [
                  { name: test.name, status: test.status },
                ],
              },
            ],
          });
        } else {
          let temp = curr[dir[cat]].values[0];
          if (temp[passed ? 'l3' : 'l4'] === undefined)
            temp[passed ? 'l3' : 'l4'] = [
              {
                name: test.name,
                status: test.status,
              },
            ];
          else
            temp[passed ? 'l3' : 'l4'].push({
              name: test.name,
              status: test.status,
            });
        }
      });
  });

  curr.forEach((result) => {
    let currentValues = result.values[0];
    if (result.values[0]['l4'] === undefined) {
      currentValues['l1'] = `${statusDescription.yes}`;
      currentValues['l2'] = `${statusDescription.yesSupported}`;
    } else if (result.values[0]['l3'].length > 0) {
      currentValues['l1'] = `${statusDescription.partially}`;
      currentValues['l2'] = `${statusDescription.partiallySupported}`;
    }
    categoriesWithTests[result.name].values.push(currentValues);
  });
});

// if a category doent exist in class, add class to that category and all Not supported tests
let updatedCategoriesWithClasses = categoriesWithTests;
Object.values(updatedCategoriesWithClasses).forEach((cat) => {
  classes.find((cl) => {
    let temp = [];
    cat.values.forEach((el) => {
      temp.push(el.class);
    });

    if (temp.length !== classes.length) {
      let difference = classes.filter((x) => !temp.includes(x));

      let allTest = [];
      cat.values.forEach((el) => {
        el.l3.forEach((test) => allTest.push(test));
        if (el.l4) {
          el.l4.forEach((test) => allTest.push(test));
        }
      });

      const notSupportedTests = allTest.map((t) => {
        return { name: t.name, status: '' };
      });

      const uniqueNotSupportedTests = [
        ...new Map(
          notSupportedTests.map((item) => [item['name'], item])
        ).values(),
      ];

      difference.forEach((diff) => {
        cat.values.push({
          class: diff,
          l1: statusDescription.notSupported,
          l4: uniqueNotSupportedTests,
        });
      });
    }
  });
});

const names = {
  flink: 'Apache Flink',
  dataflow: 'Google Cloud Dataflow',
  spark: 'Apache Spark (RDD/DStream based)',
};

// join columns and categories with colors for styling
let formattedData = {
  capability_matrix: {
    columns: [],
    categories: [
      {
        description: 'Capability Matrix (based on runner testing)',
        anchor: 'what',
        'color-y': 'fff',
        'color-yb': 'f6f6f6',
        'color-p': 'f9f9f9',
        'color-pb': 'd8d8d8',
        'color-n': 'e1e0e0',
        'color-nb': 'bcbcbc',
      },
    ],
  },
};

Object.keys(data.batch).forEach((key) => {
  formattedData.capability_matrix.columns.push({
    class: key,
    name: `${names[key]}`,
  });
});

formattedData.capability_matrix.categories[0]['rows'] = Object.keys(
  updatedCategoriesWithClasses
).map((key) => updatedCategoriesWithClasses[key]);

let jsonFormatted = JSON.stringify(formattedData);

const outputFile = argv[3];

if (outputFile) {
  if (outputFile.startsWith('gs://')) {
    fs.writeFile(
      'website/www/site/data/latest_capability_matrix.json',
      jsonFormatted,
      'utf8',
      () => {}
    );
    bucket.upload('website/www/site/data/latest_capability_matrix.json', {
      destination: outputFile.substring(5),
    });
    console.log(
      'Successfully wrote to gs://beam-validates-runner-info/latest_capability_matrix.json'
    );
  } else {
    fs.writeFile(outputFile, jsonFormatted, 'utf8', () => {});
    console.log('Successfully wrote to ' + outputFile);
  }
} else {
  console.log(jsonFormatted);
}
