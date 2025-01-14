#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

""""A pipeline that uses RunInference API to perform image classification."""

import argparse
import io
import os
from typing import Iterable
from typing import Optional
from typing import Tuple

import apache_beam as beam
import torch
from apache_beam.io.filesystems import FileSystems
from apache_beam.ml.inference.api import PredictionResult
from apache_beam.ml.inference.api import RunInference
from apache_beam.ml.inference.pytorch_inference import PytorchModelLoader
from apache_beam.options.pipeline_options import PipelineOptions
from apache_beam.options.pipeline_options import SetupOptions
from PIL import Image
from torchvision import transforms
from torchvision.models.mobilenetv2 import MobileNetV2


def read_image(image_file_name: str,
               path_to_dir: Optional[str] = None) -> Tuple[str, Image.Image]:
  if path_to_dir is not None:
    image_file_name = os.path.join(path_to_dir, image_file_name)
  with FileSystems().open(image_file_name, 'r') as file:
    data = Image.open(io.BytesIO(file.read())).convert('RGB')
    return image_file_name, data


def preprocess_image(data: Image.Image) -> torch.Tensor:
  image_size = (224, 224)
  # Pre-trained PyTorch models expect input images normalized with the
  # below values (see: https://pytorch.org/vision/stable/models.html)
  normalize = transforms.Normalize(
      mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
  transform = transforms.Compose([
      transforms.Resize(image_size),
      transforms.ToTensor(),
      normalize,
  ])
  return transform(data)


class PostProcessor(beam.DoFn):
  def process(self, element: Tuple[str, PredictionResult]) -> Iterable[str]:
    filename, prediction_result = element
    prediction = torch.argmax(prediction_result.inference, dim=0)
    yield filename + ',' + str(prediction.item())


def parse_known_args(argv):
  """Parses args for the workflow."""
  parser = argparse.ArgumentParser()
  parser.add_argument(
      '--input',
      dest='input',
      default='gs://apache-beam-ml/testing/inputs/'
      'it_mobilenetv2_imagenet_validation_inputs.txt',
      help='Path to the text file containing image names.')
  parser.add_argument(
      '--output',
      dest='output',
      help='Path where to save output predictions.'
      ' text file.')
  parser.add_argument(
      '--model_state_dict_path',
      dest='model_state_dict_path',
      default='gs://apache-beam-ml/'
      'models/imagenet_classification_mobilenet_v2.pt',
      help="Path to the model's state_dict. "
      "Default state_dict would be MobilenetV2.")
  parser.add_argument(
      '--images_dir',
      default=None,
      help='Path to the directory where images are stored.'
      'Not required if image names in the input file have absolute path.')
  return parser.parse_known_args(argv)


def run(argv=None, model_class=None, model_params=None, save_main_session=True):
  """
  Args:
    argv: Command line arguments defined for this example.
    model_class: Reference to the class definition of the model.
                If None, MobilenetV2 will be used as default .
    model_params: Parameters passed to the constructor of the model_class.
                  These will be used to instantiate the model object in the
                  RunInference API.
  """
  known_args, pipeline_args = parse_known_args(argv)
  pipeline_options = PipelineOptions(pipeline_args)
  pipeline_options.view_as(SetupOptions).save_main_session = save_main_session

  if not model_class:
    model_class = MobileNetV2
    model_params = {'num_classes': 1000}

  model_loader = PytorchModelLoader(
      state_dict_path=known_args.model_state_dict_path,
      model_class=model_class,
      model_params=model_params)

  with beam.Pipeline(options=pipeline_options) as p:
    filename_value_pair = (
        p
        | 'ReadImageNames' >> beam.io.ReadFromText(
            known_args.input, skip_header_lines=1)
        | 'ReadImageData' >> beam.Map(
            lambda image_name: read_image(
                image_file_name=image_name, path_to_dir=known_args.images_dir))
        | 'PreprocessImages' >> beam.MapTuple(
            lambda file_name, data: (file_name, preprocess_image(data))))
    predictions = (
        filename_value_pair
        | 'PyTorchRunInference' >> RunInference(model_loader).with_output_types(
            Tuple[str, PredictionResult])
        | 'ProcessOutput' >> beam.ParDo(PostProcessor()))

    if known_args.output:
      predictions | "WriteOutputToGCS" >> beam.io.WriteToText( # pylint: disable=expression-not-assigned
        known_args.output,
        shard_name_template='',
        append_trailing_newlines=True)


if __name__ == '__main__':
  run()
